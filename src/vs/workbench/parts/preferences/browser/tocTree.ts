/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { SearchResultModel, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTree';
import { ISetting } from 'vs/workbench/services/preferences/common/preferences';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const $ = DOM.$;

export class TOCTreeModel {

	private _currentSearchModel: SearchResultModel;
	private _settingsTreeRoot: SettingsTreeGroupElement;

	public set settingsTreeRoot(value: SettingsTreeGroupElement) {
		this._settingsTreeRoot = value;
		this.update();
	}

	public set currentSearchModel(model: SearchResultModel) {
		this._currentSearchModel = model;
		this.update();
	}

	public get children(): SettingsTreeElement[] {
		return this._settingsTreeRoot.children;
	}

	public update(): void {
		this.updateGroupCount(this._settingsTreeRoot);
	}

	private updateGroupCount(group: SettingsTreeGroupElement): void {
		(<any>group).count = this._currentSearchModel ?
			this.getSearchResultChildrenCount(group) :
			undefined;

		group.children.forEach(child => {
			if (child instanceof SettingsTreeGroupElement) {
				this.updateGroupCount(child);
			}
		});
	}

	private getSearchResultChildrenCount(group: SettingsTreeGroupElement): number {
		return this._currentSearchModel.getChildren().filter(child => {
			return this.groupContainsSetting(group, child.setting);
		}).length;
	}

	private groupContainsSetting(group: SettingsTreeGroupElement, setting: ISetting): boolean {
		return group.children.some(child => {
			if (child instanceof SettingsTreeSettingElement) {
				return child.setting.key === setting.key;
			} else if (child instanceof SettingsTreeGroupElement) {
				return this.groupContainsSetting(child, setting);
			} else {
				return false;
			}
		});
	}
}

export type TOCTreeElement = SettingsTreeGroupElement | TOCTreeModel;

export class TOCDataSource implements IDataSource {
	constructor(
		@IConfigurationService private configService: IConfigurationService
	) {
	}

	getId(tree: ITree, element: SettingsTreeGroupElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: TOCTreeElement): boolean {
		return element instanceof TOCTreeModel ||
			(element instanceof SettingsTreeGroupElement && element.children && element.children.every(child => child instanceof SettingsTreeGroupElement));
	}

	getChildren(tree: ITree, element: TOCTreeElement): TPromise<SettingsTreeElement[], any> {
		return TPromise.as(this._getChildren(element));
	}

	private _getChildren(element: TOCTreeElement): SettingsTreeElement[] {
		// TODO@roblou hack. Clean up or remove this option
		if (this.configService.getValue('workbench.settings.settingsSearchTocBehavior') === 'filter') {
			const children = element.children as SettingsTreeElement[]; // TS????
			return children.filter(group => {
				return (<any>group).count !== 0;
			});
		}

		return element.children;
	}

	getParent(tree: ITree, element: TOCTreeElement): TPromise<any, any> {
		return TPromise.wrap(element instanceof SettingsTreeGroupElement && element.parent);
	}

	shouldAutoexpand() {
		return true;
	}
}

const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';

interface ITOCEntryTemplate {
	element: HTMLElement;
}

export class TOCRenderer implements IRenderer {
	getHeight(tree: ITree, element: SettingsTreeElement): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: SettingsTreeElement): string {
		return TOC_ENTRY_TEMPLATE_ID;
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITOCEntryTemplate {
		return {
			element: DOM.append(container, $('.settings-toc-entry'))
		};
	}

	renderElement(tree: ITree, element: SettingsTreeGroupElement, templateId: string, template: ITOCEntryTemplate): void {
		const label = (<any>element).count ?
			`${element.label} (${(<any>element).count})` :
			element.label;

		DOM.toggleClass(template.element, 'no-results', (<any>element).count === 0);
		template.element.textContent = label;
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
	}
}
