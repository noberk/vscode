/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IUriDisplayService, UriDisplayService } from 'vs/platform/uriDisplay/common/uriDisplay';
import { TestEnvironmentService, TestContextService } from 'vs/workbench/test/workbenchTestServices';
import { Schemas } from 'vs/base/common/network';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import URI from 'vs/base/common/uri';
import { nativeSep } from 'vs/base/common/paths';
import { isWindows } from 'vs/base/common/platform';

suite('URI Display', () => {

	let uriDisplayService: IUriDisplayService;

	setup(() => {
		uriDisplayService = new UriDisplayService(TestEnvironmentService, new TestContextService());
	});

	test('file scheme', function () {
		uriDisplayService.registerFormater(Schemas.file, {
			label: '${path}',
			separator: nativeSep,
			tildify: !isWindows,
			normalizeDriveLetter: isWindows
		});

		const uri1 = TestWorkspace.folders[0].uri.with({ path: TestWorkspace.folders[0].uri.path.concat('/a/b/c/d') });
		assert.equal(uriDisplayService.getLabel(uri1, true), isWindows ? 'a\\b\\c\\d' : 'a/b/c/d');
		assert.equal(uriDisplayService.getLabel(uri1, false), isWindows ? 'C:\\testWorkspace\\a\\b\\c\\d' : '/testWorkspace/a/b/c/d');

		const uri2 = URI.file('c:\\1/2/3');
		assert.equal(uriDisplayService.getLabel(uri2, false), isWindows ? 'C:\\1\\2\\3' : '/c:\\1/2/3');
	});

	test('custom scheme', function () {
		uriDisplayService.registerFormater(Schemas.vscode, {
			label: 'LABEL/${path}/${authority}/END',
			separator: '/',
			tildify: true,
			normalizeDriveLetter: true
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.equal(uriDisplayService.getLabel(uri1, false), 'LABEL//1/2/3/4/5/microsoft.com/END');
	});
});
