/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { mergeSort } from 'vs/base/common/arrays';
import { getPathLabel } from 'vs/base/common/labels';
import { dispose, IDisposable, IReference } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditOptions, IBulkEditResult, IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { EndOfLineSequence, IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { isResourceFileEdit, isResourceTextEdit, ResourceFileEdit, ResourceTextEdit, WorkspaceEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { emptyProgressRunner, IProgress, IProgressRunner } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

abstract class Recording {

	static start(fileService: IFileService): Recording {

		let _changes = new Set<string>();
		let subscription = fileService.onAfterOperation(e => {
			_changes.add(e.resource.toString());
		});

		return {
			stop() { return subscription.dispose(); },
			hasChanged(resource) { return _changes.has(resource.toString()); }
		};
	}

	abstract stop(): void;
	abstract hasChanged(resource: URI): boolean;
}

class EditTask implements IDisposable {

	private _initialSelections: Selection[];
	private _endCursorSelection: Selection;
	private get _model(): ITextModel { return this._modelReference.object.textEditorModel; }
	private _modelReference: IReference<ITextEditorModel>;
	private _edits: IIdentifiedSingleEditOperation[];
	private _newEol: EndOfLineSequence;

	constructor(modelReference: IReference<ITextEditorModel>) {
		this._endCursorSelection = null;
		this._modelReference = modelReference;
		this._edits = [];
	}

	dispose() {
		if (this._model) {
			this._modelReference.dispose();
			this._modelReference = null;
		}
	}

	addEdit(resourceEdit: ResourceTextEdit): void {

		for (const edit of resourceEdit.edits) {
			if (typeof edit.eol === 'number') {
				// honor eol-change
				this._newEol = edit.eol;
			}
			if (edit.range || edit.text) {
				// create edit operation
				let range: Range;
				if (!edit.range) {
					range = this._model.getFullModelRange();
				} else {
					range = Range.lift(edit.range);
				}
				this._edits.push(EditOperation.replaceMove(range, edit.text));
			}
		}
	}

	apply(): void {
		if (this._edits.length > 0) {
			this._edits = mergeSort(this._edits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
			this._initialSelections = this._getInitialSelections();
			this._model.pushStackElement();
			this._model.pushEditOperations(this._initialSelections, this._edits, (edits) => this._getEndCursorSelections(edits));
			this._model.pushStackElement();
		}
		if (this._newEol !== undefined) {
			this._model.pushStackElement();
			this._model.pushEOL(this._newEol);
			this._model.pushStackElement();
		}
	}

	protected _getInitialSelections(): Selection[] {
		const firstRange = this._edits[0].range;
		const initialSelection = new Selection(
			firstRange.startLineNumber,
			firstRange.startColumn,
			firstRange.endLineNumber,
			firstRange.endColumn
		);
		return [initialSelection];
	}

	private _getEndCursorSelections(inverseEditOperations: IIdentifiedSingleEditOperation[]): Selection[] {
		let relevantEditIndex = 0;
		for (let i = 0; i < inverseEditOperations.length; i++) {
			const editRange = inverseEditOperations[i].range;
			for (let j = 0; j < this._initialSelections.length; j++) {
				const selectionRange = this._initialSelections[j];
				if (Range.areIntersectingOrTouching(editRange, selectionRange)) {
					relevantEditIndex = i;
					break;
				}
			}
		}

		const srcRange = inverseEditOperations[relevantEditIndex].range;
		this._endCursorSelection = new Selection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
		return [this._endCursorSelection];
	}

	getEndCursorSelection(): Selection {
		return this._endCursorSelection;
	}

}

class SourceModelEditTask extends EditTask {

	private _knownInitialSelections: Selection[];

	constructor(modelReference: IReference<ITextEditorModel>, initialSelections: Selection[]) {
		super(modelReference);
		this._knownInitialSelections = initialSelections;
	}

	protected _getInitialSelections(): Selection[] {
		return this._knownInitialSelections;
	}
}

class BulkEditModel implements IDisposable {

	private _textModelResolverService: ITextModelService;
	private _edits = new Map<string, ResourceTextEdit[]>();
	private _tasks: EditTask[];
	private _sourceModel: URI;
	private _sourceSelections: Selection[];
	private _sourceModelTask: SourceModelEditTask;
	private _progress: IProgress<void>;

	constructor(
		textModelResolverService: ITextModelService,
		editor: ICodeEditor,
		edits: ResourceTextEdit[],
		progress: IProgress<void>
	) {
		this._textModelResolverService = textModelResolverService;
		this._sourceModel = editor ? editor.getModel().uri : undefined;
		this._sourceSelections = editor ? editor.getSelections() : undefined;
		this._sourceModelTask = undefined;
		this._progress = progress;

		edits.forEach(this.addEdit, this);
	}

	dispose(): void {
		this._tasks = dispose(this._tasks);
	}

	addEdit(edit: ResourceTextEdit): void {
		let array = this._edits.get(edit.resource.toString());
		if (!array) {
			array = [];
			this._edits.set(edit.resource.toString(), array);
		}
		array.push(edit);
	}

	async prepare(): Promise<BulkEditModel> {

		if (this._tasks) {
			throw new Error('illegal state - already prepared');
		}

		this._tasks = [];
		const promises: TPromise<any>[] = [];

		this._edits.forEach((value, key) => {
			const promise = this._textModelResolverService.createModelReference(URI.parse(key)).then(ref => {
				const model = ref.object;

				if (!model || !model.textEditorModel) {
					throw new Error(`Cannot load file ${key}`);
				}

				let task: EditTask;
				if (this._sourceModel && model.textEditorModel.uri.toString() === this._sourceModel.toString()) {
					this._sourceModelTask = new SourceModelEditTask(ref, this._sourceSelections);
					task = this._sourceModelTask;
				} else {
					task = new EditTask(ref);
				}

				value.forEach(edit => task.addEdit(edit));
				this._tasks.push(task);
				this._progress.report(undefined);
			});
			promises.push(promise);
		});

		await TPromise.join(promises);

		return this;
	}

	apply(): Selection {
		for (const task of this._tasks) {
			task.apply();
			this._progress.report(undefined);
		}
		return this._sourceModelTask
			? this._sourceModelTask.getEndCursorSelection()
			: undefined;
	}
}

export type Edit = ResourceFileEdit | ResourceTextEdit;

export class BulkEdit {

	private _edits: Edit[] = [];
	private _editor: ICodeEditor;
	private _progress: IProgressRunner;

	constructor(
		editor: ICodeEditor,
		progress: IProgressRunner,
		@ILogService private readonly _logService: ILogService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService
	) {
		this._editor = editor;
		this._progress = progress || emptyProgressRunner;
	}

	add(edits: Edit[] | Edit): void {
		if (Array.isArray(edits)) {
			this._edits.push(...edits);
		} else {
			this._edits.push(edits);
		}
	}

	ariaMessage(): string {
		const editCount = this._edits.reduce((prev, cur) => isResourceFileEdit(cur) ? prev : prev + cur.edits.length, 0);
		const resourceCount = this._edits.length;
		if (editCount === 0) {
			return localize('summary.0', "Made no edits");
		} else if (editCount > 1 && resourceCount > 1) {
			return localize('summary.nm', "Made {0} text edits in {1} files", editCount, resourceCount);
		} else {
			return localize('summary.n0', "Made {0} text edits in one file", editCount, resourceCount);
		}
	}

	async perform(): Promise<Selection> {

		let seen = new Set<string>();
		let total = 0;

		const groups: Edit[][] = [];
		let group: Edit[];
		for (const edit of this._edits) {
			if (!group
				|| (isResourceFileEdit(group[0]) && !isResourceFileEdit(edit))
				|| (isResourceTextEdit(group[0]) && !isResourceTextEdit(edit))
			) {
				group = [];
				groups.push(group);
			}
			group.push(edit);

			if (isResourceFileEdit(edit)) {
				total += 1;
			} else if (!seen.has(edit.resource.toString())) {
				seen.add(edit.resource.toString());
				total += 2;
			}
		}

		// define total work and progress callback
		// for child operations
		this._progress.total(total);
		let progress: IProgress<void> = { report: _ => this._progress.worked(1) };

		// do it. return the last selection computed
		// by a text change (can be undefined then)
		let res: Selection = undefined;
		for (const group of groups) {
			if (isResourceFileEdit(group[0])) {
				await this._performFileEdits(<ResourceFileEdit[]>group, progress);
			} else {
				res = await this._performTextEdits(<ResourceTextEdit[]>group, progress) || res;
			}
		}
		return res;
	}

	private async _performFileEdits(edits: ResourceFileEdit[], progress: IProgress<void>) {
		this._logService.debug('_performFileEdits', JSON.stringify(edits));
		for (const edit of edits) {
			progress.report(undefined);

			let overwrite = edit.options && edit.options.overwrite;
			if (edit.newUri && edit.oldUri) {
				await this._textFileService.move(edit.oldUri, edit.newUri, overwrite);
			} else if (!edit.newUri && edit.oldUri) {
				await this._textFileService.delete(edit.oldUri, { useTrash: true, recursive: edit.options && edit.options.recursive });
			} else if (edit.newUri && !edit.oldUri) {
				let ignoreIfExists = edit.options && edit.options.ignoreIfExists;
				if (!ignoreIfExists || !await this._fileService.existsFile(edit.newUri)) {
					await this._textFileService.create(edit.newUri, undefined, { overwrite });
				}
			}
		}
	}

	private async _performTextEdits(edits: ResourceTextEdit[], progress: IProgress<void>): Promise<Selection> {
		this._logService.debug('_performTextEdits', JSON.stringify(edits));

		const recording = Recording.start(this._fileService);
		const model = new BulkEditModel(this._textModelService, this._editor, edits, progress);

		await model.prepare();

		const conflicts = edits
			.filter(edit => recording.hasChanged(edit.resource))
			.map(edit => getPathLabel(edit.resource, this._environmentService, this._contextService));

		recording.stop();

		if (conflicts.length > 0) {
			model.dispose();
			throw new Error(localize('conflict', "These files have changed in the meantime: {0}", conflicts.join(', ')));
		}

		const selection = await model.apply();
		model.dispose();
		return selection;
	}
}

export class BulkEditService implements IBulkEditService {

	_serviceBrand: any;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IModelService private readonly _modelService: IModelService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService
	) {

	}

	apply(edit: WorkspaceEdit, options: IBulkEditOptions = {}): TPromise<IBulkEditResult> {

		let { edits } = edit;
		let codeEditor = options.editor;

		// First check if loaded models were not changed in the meantime
		for (let i = 0, len = edits.length; i < len; i++) {
			const edit = edits[i];
			if (!isResourceFileEdit(edit) && typeof edit.modelVersionId === 'number') {
				let model = this._modelService.getModel(edit.resource);
				if (model && model.getVersionId() !== edit.modelVersionId) {
					// model changed in the meantime
					return TPromise.wrapError(new Error(`${model.uri.toString()} has changed in the meantime`));
				}
			}
		}

		// try to find code editor
		// todo@joh, prefer edit that gets edited
		if (!codeEditor) {
			let candidate = this._editorService.activeTextEditorWidget;
			if (isCodeEditor(candidate)) {
				codeEditor = candidate;
			}
		}

		const bulkEdit = new BulkEdit(options.editor, options.progress, this._logService, this._textModelService, this._fileService, this._textFileService, this._environmentService, this._contextService);
		bulkEdit.add(edits);

		return TPromise.wrap(bulkEdit.perform().then(selection => {
			return { selection, ariaSummary: bulkEdit.ariaMessage() };
		}, err => {
			// console.log('apply FAILED');
			// console.log(err);
			this._logService.error(err);
			throw err;
		}));
	}
}


registerSingleton(IBulkEditService, BulkEditService);
