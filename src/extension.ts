import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Cache for file stats
const statCache = new Map<string, { stat: fs.Stats; timestamp: number }>();
const STAT_CACHE_TTL = 5000; // 5 seconds TTL

export function activate(context: vscode.ExtensionContext) {
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!rootPath) {
        vscode.window.showErrorMessage('No workspace folder is open');
        return;
    }

    const exportCommand = vscode.commands.registerCommand(
        'fileTreeExporter.exportSelectedFiles',
        async (fileUri: vscode.Uri, selectedFiles: readonly vscode.Uri[]) => {
            const filesToExport = selectedFiles && selectedFiles.length > 0 
                ? selectedFiles 
                : fileUri 
                    ? [fileUri] 
                    : [];

            if (filesToExport.length === 0) {
                vscode.window.showErrorMessage('Please select files or folders to export.');
                return;
            }

            try {
                const chunks: string[] = [];
                
                // Generate file tree structure in parallel
                await Promise.all(filesToExport.map(async uri => {
                    const relativePath = path.relative(rootPath, uri.fsPath);
                    chunks.push(relativePath + '\n');
                    
                    const stat = await getCachedStat(uri.fsPath);
                    if (stat.isDirectory()) {
                        chunks.push(await generateDirectoryTree(uri.fsPath, rootPath, '  '));
                    }
                }));

                chunks.push('\n\n');

                // Process file contents in parallel
                await Promise.all(filesToExport.map(async uri => {
                    const relativePath = path.relative(rootPath, uri.fsPath);
                    const stat = await getCachedStat(uri.fsPath);
                    if (stat.isFile()) {
                        chunks.push(`File: ${relativePath}\n\`\`\`\n`);
                        const content = await readFileWithRetry(uri.fsPath);
                        chunks.push(content);
                        chunks.push('\n```\n\n');
                    } else if (stat.isDirectory()) {
                        chunks.push(await generateFileContents(uri.fsPath, rootPath));
                    }
                }));

                const output = chunks.join('');
                await vscode.env.clipboard.writeText(output);
                vscode.window.showInformationMessage('File tree copied to clipboard!');

            } catch (error) {
                vscode.window.showErrorMessage(`Error copying file tree: ${error}`);
            }
        }
    );

    context.subscriptions.push(exportCommand);
}

async function getCachedStat(filePath: string): Promise<fs.Stats> {
    const now = Date.now();
    const cached = statCache.get(filePath);
    
    if (cached && (now - cached.timestamp) < STAT_CACHE_TTL) {
        return cached.stat;
    }

    const stat = await fs.promises.stat(filePath);
    statCache.set(filePath, { stat, timestamp: now });
    return stat;
}

async function readFileWithRetry(filePath: string, retries = 3): Promise<string> {
    try {
        return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
            return readFileWithRetry(filePath, retries - 1);
        }
        throw error;
    }
}

async function generateDirectoryTree(dirPath: string, rootPath: string, indent: string): Promise<string> {
    const chunks: string[] = [];
    const files = await fs.promises.readdir(dirPath);
    const sortedFiles = files.sort(); // Sort files alphabetically
    const isLast = new Map<string, boolean>();
    
    // Mark last items in each level
    for (let i = 0; i < sortedFiles.length; i++) {
        isLast.set(sortedFiles[i], i === sortedFiles.length - 1);
    }

    // Process directory entries in parallel
    await Promise.all(sortedFiles.map(async file => {
        const filePath = path.join(dirPath, file);
        const stat = await getCachedStat(filePath);
        const prefix = isLast.get(file) ? '└── ' : '├── ';
        chunks.push(`${indent}${prefix}${file}\n`);
        
        if (stat.isDirectory()) {
            const nextIndent = indent + (isLast.get(file) ? '    ' : '│   ');
            chunks.push(await generateDirectoryTree(filePath, rootPath, nextIndent));
        }
    }));
    
    return chunks.join('');
}

async function generateFileContents(dirPath: string, rootPath: string): Promise<string> {
    const chunks: string[] = [];
    const files = await fs.promises.readdir(dirPath);
    
    // Process files in parallel
    await Promise.all(files.map(async file => {
        const filePath = path.join(dirPath, file);
        const relativePath = path.relative(rootPath, filePath);
        const stat = await getCachedStat(filePath);
        
        if (stat.isFile()) {
            chunks.push(`File: ${relativePath}\n\`\`\`\n`);
            const content = await readFileWithRetry(filePath);
            chunks.push(content);
            chunks.push('\n```\n\n');
        } else if (stat.isDirectory()) {
            chunks.push(await generateFileContents(filePath, rootPath));
        }
    }));
    
    return chunks.join('');
}

export function deactivate() {
    statCache.clear();
}