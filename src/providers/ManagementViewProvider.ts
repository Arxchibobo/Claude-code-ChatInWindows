import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PluginManager } from '../services/PluginManager';
import { SkillsManager } from '../services/SkillsManager';
import { CommandsManager } from '../services/CommandsManager';
import { AgentsManager } from '../services/AgentsManager';

/**
 * Management View Provider
 * 提供 Plugins/Skills/Commands/Agents 的可视化管理界面
 */
export class ManagementViewProvider {
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];

    private _pluginManager: PluginManager;
    private _skillsManager: SkillsManager;
    private _commandsManager: CommandsManager;
    private _agentsManager: AgentsManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        // 初始化各个 Manager
        this._pluginManager = PluginManager.getInstance();
        this._skillsManager = SkillsManager.getInstance();
        this._commandsManager = CommandsManager.getInstance();
        this._agentsManager = AgentsManager.getInstance();
    }

    /**
     * 显示管理界面
     */
    public show(): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 如果 panel 已存在，直接显示
        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        // 创建新的 WebView 面板
        this._panel = vscode.window.createWebviewPanel(
            'claudeManagement',
            'Claude Management',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this._extensionUri]
            }
        );

        // 设置图标
        this._panel.iconPath = {
            light: vscode.Uri.joinPath(this._extensionUri, 'icon.png'),
            dark: vscode.Uri.joinPath(this._extensionUri, 'icon.png')
        };

        // 加载 HTML 内容
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // 处理来自 WebView 的消息
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );

        // 面板关闭时清理
        this._panel.onDidDispose(
            () => this._dispose(),
            null,
            this._disposables
        );
    }

    /**
     * 处理来自 WebView 的消息
     */
    private async _handleMessage(message: any): Promise<void> {
        try {
            console.log('[ManagementView] Received message:', message);

            const requestId = message.requestId;

            switch (message.type) {
                // ===== Plugins API =====
                case 'getPlugins':
                    await this._handleGetPlugins(requestId);
                    break;

                case 'enablePlugin':
                    await this._handleEnablePlugin(message.pluginId, requestId);
                    break;

                case 'disablePlugin':
                    await this._handleDisablePlugin(message.pluginId, requestId);
                    break;

                case 'getPluginStatus':
                    await this._handleGetPluginStatus(message.pluginId, requestId);
                    break;

                // ===== Skills API =====
                case 'getSkills':
                    await this._handleGetSkills(requestId);
                    break;

                case 'getSkillDetails':
                    await this._handleGetSkillDetails(message.skillName, message.location, requestId);
                    break;

                case 'searchSkills':
                    await this._handleSearchSkills(message.query, requestId);
                    break;

                // ===== Commands API =====
                case 'getCommands':
                    await this._handleGetCommands(requestId);
                    break;

                case 'getCommandDetails':
                    await this._handleGetCommandDetails(message.commandName, requestId);
                    break;

                // ===== Agents API =====
                case 'getAgents':
                    await this._handleGetAgents(requestId);
                    break;

                case 'getAgentDetails':
                    await this._handleGetAgentDetails(message.agentName, requestId);
                    break;

                default:
                    console.warn('[ManagementView] Unknown message type:', message.type);
            }

        } catch (error) {
            console.error('[ManagementView] Error handling message:', error);
            this._sendMessage({
                type: 'error',
                requestId: message.requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // ===== Plugins Handlers =====

    private async _handleGetPlugins(requestId?: any): Promise<void> {
        const plugins = await this._pluginManager.loadInstalledPlugins(false);

        // 添加启用状态
        const pluginsWithStatus = plugins.map(plugin => ({
            ...plugin,
            enabled: plugin.rawName ? this._pluginManager.getPluginEnabledStatus(plugin.rawName) : true
        }));

        this._sendMessage({
            type: 'pluginsData',
            requestId,
            data: pluginsWithStatus
        });
    }

    private async _handleEnablePlugin(pluginId: string, requestId?: any): Promise<void> {
        const success = await this._pluginManager.enablePlugin(pluginId);

        this._sendMessage({
            type: 'pluginEnabled',
            requestId,
            data: { pluginId, success }
        });

        if (success) {
            vscode.window.showInformationMessage(`Plugin "${pluginId}" enabled`);
        }
    }

    private async _handleDisablePlugin(pluginId: string, requestId?: any): Promise<void> {
        const success = await this._pluginManager.disablePlugin(pluginId);

        this._sendMessage({
            type: 'pluginDisabled',
            requestId,
            data: { pluginId, success }
        });

        if (success) {
            vscode.window.showInformationMessage(`Plugin "${pluginId}" disabled`);
        }
    }

    private async _handleGetPluginStatus(pluginId: string, requestId?: any): Promise<void> {
        const enabled = this._pluginManager.getPluginEnabledStatus(pluginId);

        this._sendMessage({
            type: 'pluginStatus',
            requestId,
            data: { pluginId, enabled }
        });
    }

    // ===== Skills Handlers =====

    private async _handleGetSkills(requestId?: any): Promise<void> {
        const skills = await this._skillsManager.loadSkills(false);

        this._sendMessage({
            type: 'skillsData',
            requestId,
            data: skills
        });
    }

    private async _handleGetSkillDetails(skillName: string, location: string, requestId?: any): Promise<void> {
        const details = await this._skillsManager.getSkillDetails(skillName, location as any);

        this._sendMessage({
            type: 'skillDetails',
            requestId,
            data: details
        });
    }

    private async _handleSearchSkills(query: string, requestId?: any): Promise<void> {
        const skills = await this._skillsManager.searchSkills(query);

        this._sendMessage({
            type: 'skillsSearchResults',
            requestId,
            data: skills
        });
    }

    // ===== Commands Handlers =====

    private async _handleGetCommands(requestId?: any): Promise<void> {
        const commands = await this._commandsManager.loadCommands(false);

        this._sendMessage({
            type: 'commandsData',
            requestId,
            data: commands
        });
    }

    private async _handleGetCommandDetails(commandName: string, requestId?: any): Promise<void> {
        const details = await this._commandsManager.getCommandDetails(commandName);

        this._sendMessage({
            type: 'commandDetails',
            requestId,
            data: details
        });
    }

    // ===== Agents Handlers =====

    private async _handleGetAgents(requestId?: any): Promise<void> {
        const agents = await this._agentsManager.loadAgents(false);

        this._sendMessage({
            type: 'agentsData',
            requestId,
            data: agents
        });
    }

    private async _handleGetAgentDetails(agentName: string, requestId?: any): Promise<void> {
        const details = await this._agentsManager.getAgentDetails(agentName);

        this._sendMessage({
            type: 'agentDetails',
            requestId,
            data: details
        });
    }

    /**
     * 发送消息到 WebView
     */
    private _sendMessage(message: any): void {
        if (this._panel) {
            this._panel.webview.postMessage(message);
        }
    }

    /**
     * 获取 WebView 的 HTML 内容
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // 读取管理界面的 HTML 文件
        const htmlPath = vscode.Uri.joinPath(
            this._extensionUri,
            'src',
            'ui-v2',
            'management',
            'index.html'
        );

        try {
            let html = fs.readFileSync(htmlPath.fsPath, 'utf-8');

            // 替换资源引用为 WebView URI
            const scriptUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'src', 'ui-v2', 'management', 'app.js')
            );

            // 注入 VS Code API 和替换脚本路径
            html = html.replace(
                '</head>',
                `<script>
                    const vscode = acquireVsCodeApi();

                    // 替换 fetch 为 postMessage
                    window.API_BASE = '';
                    window.vscodeAPI = {
                        request: function(endpoint, options = {}) {
                            return new Promise((resolve, reject) => {
                                const messageId = Date.now() + Math.random();
                                const type = endpoint.replace('/api/', 'get');

                                // 监听响应
                                const handler = (event) => {
                                    const message = event.data;
                                    if (message.requestId === messageId) {
                                        window.removeEventListener('message', handler);
                                        resolve({ ok: true, json: () => Promise.resolve(message.data) });
                                    }
                                };
                                window.addEventListener('message', handler);

                                // 发送请求
                                vscode.postMessage({
                                    type: type,
                                    requestId: messageId,
                                    ...options.body
                                });
                            });
                        }
                    };
                </script>
                </head>`
            );

            // 替换外部脚本引用
            html = html.replace(
                /<script src="app\.js"><\/script>/g,
                `<script src="${scriptUri}"></script>`
            );

            return html;

        } catch (error) {
            console.error('[ManagementView] Error loading HTML:', error);
            return this._getErrorHtml();
        }
    }

    /**
     * 获取错误页面 HTML
     */
    private _getErrorHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        h1 { color: var(--vscode-errorForeground); }
    </style>
</head>
<body>
    <h1>Failed to load Management UI</h1>
    <p>Please check the console for errors.</p>
</body>
</html>`;
    }

    /**
     * 清理资源
     */
    private _dispose(): void {
        this._panel = undefined;

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * 主动释放资源
     */
    public dispose(): void {
        this._dispose();
    }
}
