import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { before, after } from 'mocha';

suite('File Tree Exporter Extension Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    let testFiles: { [key: string]: string } = {};

    // Setup test workspace before running tests
    before(async () => {
        // Create test workspace structure
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }

        // Create test files
        testFiles = {
            'file1.txt': 'Content of file1',
            'file2.js': 'console.log("Hello");',
            'folder1/file3.txt': 'Content of file3',
            'folder1/subfolder/file4.txt': 'Content of file4',
            '.gitignore': 'node_modules\n*.log\n'
        };

        // Create test files and folders
        for (const [filePath, content] of Object.entries(testFiles)) {
            const fullPath = path.join(testWorkspaceDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
        }

        // Open the test workspace
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(testWorkspaceDir));
    });

    // Cleanup after tests
    after(() => {
        if (fs.existsSync(testWorkspaceDir)) {
            fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
        }
    });

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('your-publisher.file-tree-exporter'));
    });

    test('Command should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('fileTreeExporter.exportSelectedFiles'));
    });

    test('Should export single file', async () => {
        const fileUri = vscode.Uri.file(path.join(testWorkspaceDir, 'file1.txt'));
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', fileUri);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.ok(clipboardContent.includes('file1.txt'));
        assert.ok(clipboardContent.includes('Content of file1'));
        assert.ok(clipboardContent.includes('```'));
    });

    test('Should export multiple files', async () => {
        const fileUris = [
            vscode.Uri.file(path.join(testWorkspaceDir, 'file1.txt')),
            vscode.Uri.file(path.join(testWorkspaceDir, 'file2.js'))
        ];
        
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', undefined, fileUris);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.ok(clipboardContent.includes('file1.txt'));
        assert.ok(clipboardContent.includes('file2.js'));
        assert.ok(clipboardContent.includes('Content of file1'));
        assert.ok(clipboardContent.includes('console.log("Hello");'));
    });

    test('Should export directory structure', async () => {
        const folderUri = vscode.Uri.file(path.join(testWorkspaceDir, 'folder1'));
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', folderUri);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.ok(clipboardContent.includes('folder1'));
        assert.ok(clipboardContent.includes('  file3.txt'));
        assert.ok(clipboardContent.includes('  subfolder'));
        assert.ok(clipboardContent.includes('    file4.txt'));
        assert.ok(clipboardContent.includes('Content of file3'));
        assert.ok(clipboardContent.includes('Content of file4'));
    });

    test('Should respect .gitignore patterns', async () => {
        // Create ignored file
        const ignoredFilePath = path.join(testWorkspaceDir, 'test.log');
        fs.writeFileSync(ignoredFilePath, 'This should be ignored');
        
        const fileUris = [
            vscode.Uri.file(ignoredFilePath),
            vscode.Uri.file(path.join(testWorkspaceDir, 'file1.txt'))
        ];
        
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', undefined, fileUris);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.ok(!clipboardContent.includes('test.log'));
        assert.ok(!clipboardContent.includes('This should be ignored'));
        assert.ok(clipboardContent.includes('file1.txt'));
    });

    test('Should handle empty selection', async () => {
        let errorThrown = false;
        try {
            await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', undefined, []);
        } catch {
            errorThrown = true;
        }
        assert.ok(errorThrown);
    });

    test('Should handle non-existent files', async () => {
        const nonExistentUri = vscode.Uri.file(path.join(testWorkspaceDir, 'non-existent.txt'));
        let errorThrown = false;
        try {
            await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', nonExistentUri);
        } catch {
            errorThrown = true;
        }
        assert.ok(errorThrown);
    });

    test('Should format output correctly', async () => {
        const fileUri = vscode.Uri.file(path.join(testWorkspaceDir, 'file1.txt'));
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', fileUri);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        const expectedFormat = `file1.txt\n\nFile: file1.txt\n\`\`\`\nContent of file1\n\`\`\`\n\n`;
        assert.strictEqual(clipboardContent, expectedFormat);
    });
});