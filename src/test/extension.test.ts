import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { before, after } from 'mocha';

suite('File Tree Exporter Extension Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    let testWorkspace: vscode.WorkspaceFolder;
    
    // Test file structure
    const testFiles = {
        'readme.md': '# Test Project\nThis is a test file.',
        'src/index.ts': 'console.log("Hello world");',
        'src/utils/helper.ts': 'export const sum = (a: number, b: number) => a + b;',
        'test/basic.test.ts': 'describe("test", () => { it("works", () => {}) });',
        '.env': 'API_KEY=test123\n',
        'package.json': '{"name": "test-project", "version": "1.0.0"}'
    };

    before(async () => {
        // Setup test workspace
        if (fs.existsSync(testWorkspaceDir)) {
            fs.rmSync(testWorkspaceDir, { recursive: true });
        }
        fs.mkdirSync(testWorkspaceDir, { recursive: true });

        // Create test files
        for (const [filePath, content] of Object.entries(testFiles)) {
            const fullPath = path.join(testWorkspaceDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
        }

        // Open test workspace
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(testWorkspaceDir));
        
        // Wait for workspace to be fully loaded
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        testWorkspace = vscode.workspace.workspaceFolders![0];
    });

    after(() => {
        // Cleanup
        if (fs.existsSync(testWorkspaceDir)) {
            fs.rmSync(testWorkspaceDir, { recursive: true });
        }
    });

    test('Extension activation', async () => {
        const ext = vscode.extensions.getExtension('your-publisher.file-tree-exporter');
        assert.ok(ext, 'Extension should be available');
        await ext?.activate();
        assert.ok(ext?.isActive, 'Extension should be active');
    });

    test('Command registration', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('fileTreeExporter.exportSelectedFiles'), 
            'Export command should be registered');
    });

    test('Export single file', async () => {
        const fileUri = vscode.Uri.file(path.join(testWorkspaceDir, 'readme.md'));
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', fileUri);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.ok(clipboardContent.includes('readme.md'));
        assert.ok(clipboardContent.includes('# Test Project'));
        assert.ok(clipboardContent.includes('```'));
    });

    test('Export directory tree', async () => {
        const srcUri = vscode.Uri.file(path.join(testWorkspaceDir, 'src'));
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', srcUri);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        
        // Check directory structure
        assert.ok(clipboardContent.includes('src'));
        assert.ok(clipboardContent.includes('├── index.ts'));
        assert.ok(clipboardContent.includes('└── utils'));
        assert.ok(clipboardContent.includes('    └── helper.ts'));
        
        // Check file contents
        assert.ok(clipboardContent.includes('console.log("Hello world")'));
        assert.ok(clipboardContent.includes('export const sum'));
    });

    test('Export multiple files', async () => {
        const fileUris = [
            vscode.Uri.file(path.join(testWorkspaceDir, 'readme.md')),
            vscode.Uri.file(path.join(testWorkspaceDir, 'package.json'))
        ];
        
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', undefined, fileUris);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.ok(clipboardContent.includes('readme.md'));
        assert.ok(clipboardContent.includes('package.json'));
        assert.ok(clipboardContent.includes('"name": "test-project"'));
    });

    test('Handle special characters', async () => {
        // Create file with special characters
        const specialFileName = 'special-€#@.txt';
        const specialFilePath = path.join(testWorkspaceDir, specialFileName);
        fs.writeFileSync(specialFilePath, 'Special content');
        
        const fileUri = vscode.Uri.file(specialFilePath);
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', fileUri);
        
        const clipboardContent = await vscode.env.clipboard.readText();
        assert.ok(clipboardContent.includes(specialFileName));
        assert.ok(clipboardContent.includes('Special content'));
    });

    test('Handle binary files', async () => {
        // Create binary file
        const binaryPath = path.join(testWorkspaceDir, 'binary.bin');
        fs.writeFileSync(binaryPath, Buffer.from([0x89, 0x50, 0x4E, 0x47]));
        
        const fileUri = vscode.Uri.file(binaryPath);
        
        // Should handle binary files gracefully
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', fileUri);
        const clipboardContent = await vscode.env.clipboard.readText();
        
        assert.ok(clipboardContent.includes('binary.bin'));
    });

    test('Error handling - empty selection', async () => {
        let errorShown = false;
        const originalShowError = vscode.window.showErrorMessage;
        
        // Mock showErrorMessage
        vscode.window.showErrorMessage = async (message: string) => {
            errorShown = true;
            return undefined;
        };
        
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', undefined, []);
        
        // Restore original
        vscode.window.showErrorMessage = originalShowError;
        
        assert.ok(errorShown, 'Should show error for empty selection');
    });

    test('Cache behavior', async () => {
        const filePath = path.join(testWorkspaceDir, 'cached.txt');
        fs.writeFileSync(filePath, 'Initial content');
        
        const fileUri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', fileUri);
        
        // Modify file
        fs.writeFileSync(filePath, 'Modified content');
        
        // Wait for cache to expire (> 5000ms)
        await new Promise(resolve => setTimeout(resolve, 5500));
        
        await vscode.commands.executeCommand('fileTreeExporter.exportSelectedFiles', fileUri);
        const clipboardContent = await vscode.env.clipboard.readText();
        
        assert.ok(clipboardContent.includes('Modified content'));
    });
});