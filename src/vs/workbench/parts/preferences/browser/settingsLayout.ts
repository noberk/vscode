/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ISetting } from 'vs/workbench/services/preferences/common/preferences';

export interface ITOCEntry {
	id: string;
	label: string;

	children?: ITOCEntry[];
	settings?: (string | ISetting)[];
}

export const commonlyUsedData: ITOCEntry = {
	id: 'commonlyUsed',
	label: localize('commonlyUsed', "Commonly Used"),
	settings: ['files.autoSave', 'editor.fontSize', 'editor.fontFamily', 'editor.tabSize', 'editor.renderWhitespace', 'editor.cursorStyle', 'editor.multiCursorModifier', 'editor.insertSpaces', 'editor.wordWrap', 'files.exclude', 'files.associations']
};

export const tocData: ITOCEntry = {
	id: 'root',
	label: 'root',
	children: [
		{
			id: 'editor',
			label: localize('textEditor', "Text Editor"),
			children: [
				{
					id: 'editor/cursor',
					label: localize('cursor', "Cursor"),
					settings: ['editor.cursor*']
				},
				{
					id: 'editor/find',
					label: localize('find', "Find"),
					settings: ['editor.find.*']
				},
				{
					id: 'editor/font',
					label: localize('font', "Font"),
					settings: ['editor.font*']
				},
				{
					id: 'editor/format',
					label: localize('format', "Format"),
					settings: ['editor.format*']
				},
				{
					id: 'editor/diffEditor',
					label: localize('diffEditor', "Diff Editor"),
					settings: ['diffEditor.*']
				},
				{
					id: 'editor/minimap',
					label: localize('minimap', "Minimap"),
					settings: ['editor.minimap.*']
				},
				{
					id: 'editor/suggestions',
					label: localize('suggestions', "Suggestions"),
					settings: ['editor.*suggestion*']
				},
				{
					id: 'editor/files',
					label: localize('files', "Files"),
					settings: ['files.*']
				},
				{
					id: 'editor/editor',
					label: localize('textEditor', "Text Editor"),
					settings: ['editor.*']
				}
			]
		},
		{
			id: 'workbench',
			label: localize('workbench', "Workbench"),
			children: [
				{
					id: 'workbench/appearance',
					label: localize('appearance', "Appearance"),
					settings: ['workbench.activityBar.*', 'workbench.*color*', 'workbench.fontAliasing', 'workbench.iconTheme', 'workbench.sidebar.location', 'workbench.*.visible', 'workbench.tips.enabled', 'workbench.tree.*', 'workbench.view.*']
				},
				{
					id: 'workbench/editor',
					label: localize('editorManagement', "Editor Management"),
					settings: ['workbench.editor.*']
				},
				{
					id: 'workbench/settings',
					label: localize('settings', "Settings Editor"),
					settings: ['workbench.settings.*']
				},
				{
					id: 'workbench/zenmode',
					label: localize('zenMode', "Zen Mode"),
					settings: ['zenmode.*']
				},
				{
					id: 'workbench/workbench',
					label: localize('workbench', "Workbench"),
					settings: ['workbench.*']
				}
			]
		},
		{
			id: 'window',
			label: localize('window', "Window"),
			children: [
				{
					id: 'window/newWindow',
					label: localize('newWindow', "New Window"),
					settings: ['window.*newwindow*']
				},
				{
					id: 'window/window',
					label: localize('window', "Window"),
					settings: ['window.*']
				}
			]
		},
		{
			id: 'features',
			label: localize('features', "Features"),
			children: [
				{
					id: 'features/explorer',
					label: localize('fileExplorer', "File Explorer"),
					settings: ['explorer.*', 'outline.*']
				},
				{
					id: 'features/search',
					label: localize('search', "Search"),
					settings: ['search.*']
				}
				,
				{
					id: 'features/debug',
					label: localize('debug', "Debug"),
					settings: ['debug.*', 'launch']
				},
				{
					id: 'features/scm',
					label: localize('scm', "SCM"),
					settings: ['scm.*']
				},
				{
					id: 'features/extensions',
					label: localize('extensionViewlet', "Extension Viewlet"),
					settings: ['extensions.*']
				},
				{
					id: 'features/terminal',
					label: localize('terminal', "Terminal"),
					settings: ['terminal.*']
				},
				{
					id: 'features/problems',
					label: localize('problems', "Problems"),
					settings: ['problems.*']
				}
			]
		},
		{
			id: 'application',
			label: localize('application', "Application"),
			children: [
				{
					id: 'application/http',
					label: localize('proxy', "Proxy"),
					settings: ['http.*']
				},
				{
					id: 'application/keyboard',
					label: localize('keyboard', "Keyboard"),
					settings: ['keyboard.*']
				},
				{
					id: 'application/update',
					label: localize('update', "Update"),
					settings: ['update.*']
				},
				{
					id: 'application/telemetry',
					label: localize('telemetry', "Telemetry"),
					settings: ['telemetry.*']
				}
			]
		}
	]
};
