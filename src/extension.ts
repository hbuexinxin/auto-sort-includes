import * as vscode from "vscode";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.workspace.onWillSaveTextDocument((event) => {
    if (isTargetFile(event.document)) {
      const edit = sortIncludes(event.document);
      if (edit) {
        event.waitUntil(Promise.resolve([edit]));
      }
    }
  });

  context.subscriptions.push(disposable);
}

function isTargetFile(document: vscode.TextDocument): boolean {
  const ext = path.extname(document.fileName).toLowerCase();
  return [".h", ".c", ".cpp", ".hpp"].includes(ext);
}

function getSelfCppHeaderIncludeStr(filePath: string): string {
  // get file name ,combine to #include "<filename>.h"
  const ext = path.extname(filePath).toLowerCase();
  const includeStr = `"${path.basename(filePath, ext)}.h"`;
  return includeStr;
}

function sortIncludes(
  document: vscode.TextDocument
): vscode.TextEdit | undefined {
  const text = document.getText();
  const lines = text.split("\n");

  const includeRegex = /^#include\s+(<[^>]+>|"[^"]+")/;
  const includeLines: string[] = [];
  let startLine = -1;
  let endLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (includeRegex.test(lines[i])) {
      if (startLine === -1) startLine = i;
      endLine = i;
      includeLines.push(lines[i]);
    } else if (startLine !== -1 && lines[i].trim() === "") {
      // 保留紧跟在 include 语句后的空行
      endLine = i;
    } else if (startLine !== -1) {
      break;
    }
  }

  if (startLine === -1 || endLine === -1) {
    return undefined;
  }

  const sortedIncludes = sortIncludeLines(includeLines, document.fileName);
  const newText = sortedIncludes.join("\n") + "\n";

  return vscode.TextEdit.replace(
    new vscode.Range(startLine, 0, endLine + 1, 0),
    newText
  );
}

interface IncludeHeaderLine {
  priority: number;
  regex: RegExp;
  lines: string[];
}

function sortIncludeLines(includeLines: string[], filename: string): string[] {
  console.log(includeLines);
  console.log(filename);

  //删除空行
  includeLines = includeLines.filter((line) => line.trim() !== "");

  const groups: IncludeHeaderLine[] = [
    {
      priority: 0,
      regex: new RegExp(`^${getSelfCppHeaderIncludeStr(filename)}$`),
      lines: [],
    },
    { priority: 1, regex: /^<[a-zA-Z0-9_]+>$/, lines: [] },
    { priority: 2, regex: /^<[a-zA-Z0-9_]+\.h>$/, lines: [] },
    { priority: 3, regex: /^<.*\/.*/, lines: [] },
    { priority: 5, regex: /^".*"$/, lines: [] },
    { priority: 9, regex: /.*/, lines: [] }, // normal line, no include
  ];

  includeLines.forEach((line) => {
    const match = line.match(/#include\s+(<[^>]+>|"[^"]+")/);
    if (match) {
      const header = match[1];

      for (const group of groups) {
        if (group.regex.test(header)) {
          group.lines.push(line);
          break;
        }
      }
    } else {
      groups[groups.length - 1].lines.push(line);
    }
  });

  // 按优先级顺序合并分组，并在非空分组之间添加空行
  const result: string[] = [];

  // 对每个组内的头文件进行不区分大小写的排序
  for (const group in groups) {
    if (groups[group].lines.length > 0) {
      groups[group].lines.sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );

      result.push(...groups[group].lines);
      if (result.length > 0) {
        result.push(""); // 添加空行
      }
    }
  }

  return result;
}

export function deactivate() {}
