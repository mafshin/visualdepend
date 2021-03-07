// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
	j2xParser,
	parse
} from 'fast-xml-parser';
import {
	readFile,
	readFileSync
} from 'fs';
import {
	resolve,
	sep
} from 'path';
import {
	TextDecoder,
	TextEncoder
} from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "visualdepend" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('visualdepend.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Mohsen Afshin!');
	});

	context.subscriptions.push(disposable);

	let selectSolutionCommand = vscode.commands.registerCommand('visualdepend.selectSolution', async () => {

		var solutionFiles = await vscode.workspace.findFiles("**/*.sln", null, 10);

		var solutionPaths = solutionFiles.map(s => s.fsPath);

		vscode.window.showQuickPick(solutionPaths)
			.then(sln => showSolutionDependencies(sln));
	});
	let selectProjectCommand = vscode.commands.registerCommand('visualdepend.selectProject', async () => {

		var folders = vscode.workspace.workspaceFolders;

		if (folders) {
			var slnPath = folders[0].uri.fsPath;

			var projectFiles = await vscode.workspace.findFiles("**/*.csproj", null, 10);

			var dep = await getDependencies(projectFiles.map(x => x.fsPath));

			showInNewDocument(dep);

			vscode.window.showInformationMessage('Project file is selected');
		}
	});
	context.subscriptions.push(selectSolutionCommand);
	context.subscriptions.push(selectProjectCommand);
}

function showInWebView(dep: any) {
	const panel = vscode.window.createWebviewPanel('visualdepend', 'Solution dependency graph',
		vscode.ViewColumn.One, {
			enableScripts: true
		});
	panel.webview.html = getGraphHtml(dep);
}

function getGraphHtml(dep: any) {
	var nodes = dep.map(d => d.project);
	let dic = Object.assign({}, ...nodes.map((x) => ({
		[x.path]: x.id
	})));
	var linksData = dep.flatMap(d => d.dependencies.map(dd => {
		return {
			id: d.project.id,
			dep: dd
		}
	}));
	var links = linksData.map(d => {
		return {
			data:{
			id: `${d.id}-${dic[d.dep]}`,
			source: d.id,
			target: dic[d.dep]
			}
		}
	});
	var data = nodes.map(n => {return { data: n}}).concat(links);
	return getHtml(JSON.stringify(data));
}

function showInNewDocument(dep: any) {
	var json = JSON.stringify(dep, null, '\t');

	var depFilePath = path.join(vscode.workspace.rootPath, 'dependenies.json');

	fs.writeFileSync(depFilePath, json, 'utf8');

	var openPath = vscode.Uri.parse("file:///" + depFilePath);
	vscode.workspace.openTextDocument(openPath).then(doc => {
		vscode.window.showTextDocument(doc);
	});
}

async function showSolutionDependencies(solution ? : string) {
	if (solution) {
		var solutionDirectory = resolve(solution, '..');
		var solutionFile = await readFileContent(solution);
		var regex = /"(?<name>[^"]*)"[,\s]+"(?<path>[ \w\.\\]*\.csproj)"/mg;
		var match;
		let projects = new Array < any > ();
		var id = 1;
		while ((match = regex.exec(solutionFile)) !== null) {
			var projectFullPath = solutionDirectory + sep + match.groups.path;
			var project = {
				name: match.groups.name,
				path: projectFullPath,
				id: id++,
				x: 100 + Math.round(Math.random() * 300),
				y: 100 + Math.round(Math.random() * 300)
			};
			projects.push(project);
		}

		var dependencies = await Promise.all(projects.map(async proj => {
			return {
				project: proj,
				dependencies: await getProjectDependencies(proj.path)
			};
		}));

		//showInNewDocument(dependencies);


		showInWebView(dependencies);
	}
}

async function getDependencies(projectFilePaths: Array < string > ) {
	var dependencies = await Promise.all(projectFilePaths.map(async proj => {
		return {
			project: proj,
			dependencies: await getProjectDependencies(proj)
		};
	}));

	return dependencies;
}

async function getProjectDependencies(projectFilePath: string) {
	var string = await readFileContent(projectFilePath);
	var projectFolder = resolve(projectFilePath, '..');
	var options = {
		attributeNamePrefix: "@_",
		attrNodeName: "attr", //default is 'false'
		textNodeName: "#text",
		ignoreAttributes: false,
		ignoreNameSpace: false,
		allowBooleanAttributes: false,
		parseNodeValue: true,
		parseAttributeValue: true,
		trimValues: true,
		cdataTagName: "__cdata", //default is 'false'
		cdataPositionChar: "\\c",
		parseTrueNumberOnly: false,
		arrayMode: false, //"strict",
		stopNodes: ["parse-me-as-string"]
	};
	var projectFile = parse(string, options);
	var dependencies = projectFile.Project.ItemGroup.filter(x => x.ProjectReference != null)
		.flatMap(x => x.ProjectReference).map(x => < string > x.attr["@_Include"])
		.map(p => path.join(projectFolder, p));
	return dependencies;
}

async function readFileContent(projectFilePath: string) {
	var uint8array = await readFileSync(projectFilePath);
	var string = new TextDecoder().decode(uint8array);
	return string;
}

function getHtml(data: any) {
	var html = `
	<!DOCTYPE html>
	<meta charset="utf-8">
	
	<!-- Load d3.js -->
	<script src="https://unpkg.com/cytoscape@3.18.0/dist/cytoscape.min.js"></script>
	
	<!-- Create a div where the graph will take place -->
	<div id="cy"></div>
	
	<style>
		#cy {
	  width: 800px;
	  height: 800px;
	  background: white;
	  display: block;
	}
	</style>
	
	<script>
		var cy = cytoscape({
	
	container: document.getElementById('cy'), // container to render in
	
	elements: ${data},
	
	style: [ // the stylesheet for the graph
	  {
		selector: 'node',
		style: {
		  'background-color': '#666',
		  'label': 'data(name)',
		  'color': 'black',
		  'shape': 'round-rectangle',
		  'width': 150,
		  'height': 100,
		  'font-size': 20,
		  "text-valign" : "center",
		  "text-halign" : "center",
		  'text-max-width': 130,
		  'text-wrap': 'wrap',
		  'text-overflow-wrap': 'anywhere'
		}
	  },
	
	  {
		selector: 'edge',
		style: {
		  'width': 4,
		  'line-color': 'gray',
		  'target-arrow-color': 'black',
		  'target-arrow-shape': 'triangle',
		  'curve-style': 'bezier',
		  'arrow-scale': 1
		}
	  }
	]
	
	});
	let options = {
		name: 'cise',
	  
		fit: true, // whether to fit the viewport to the graph
		directed: false, // whether the tree is directed downwards (or edges can point in any direction if false)
		padding: 30, // padding on fit
		circle: false, // put depths in concentric circles if true, put depths top down if false
		grid: false, // whether to create an even grid into which the DAG is placed (circle:false only)
		spacingFactor: 1.75, // positive spacing factor, larger => more space between nodes (N.B. n/a if causes overlap)
		boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
		avoidOverlap: true, // prevents node overlap, may overflow boundingBox if not enough space
		nodeDimensionsIncludeLabels: false, // Excludes the label when calculating node bounding boxes for the layout algorithm
		roots: undefined, // the roots of the trees
		maximal: false, // whether to shift nodes down their natural BFS depths in order to avoid upwards edges (DAGS only)
		animate: false, // whether to transition the node positions
		animationDuration: 500, // duration of animation in ms if enabled
		animationEasing: undefined, // easing of animation if enabled,
		animateFilter: function ( node, i ){ return true; }, // a function that determines whether the node should be animated.  All nodes animated by default on animate enabled.  Non-animated nodes are positioned immediately when the layout starts
		ready: undefined, // callback on layoutready
		stop: undefined, // callback on layoutstop
		transform: function (node, position ){ return position; } // transform a given node position. Useful for changing flow direction in discrete layouts
	  };
	  
	  cy.layout( options );
	</script>
	`;

	return html;
}

// this method is called when your extension is deactivated
export function deactivate() {}