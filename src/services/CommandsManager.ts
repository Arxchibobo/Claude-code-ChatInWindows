import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Command 数据结构
 */
export interface Command {
    name: string;           // Command 名称
    path: string;           // 完整路径
    description?: string;   // 描述
    usage?: string;         // 使用方法
    hasReadme: boolean;     // 是否有 README
}

/**
 * Command 详情
 */
export interface CommandDetails extends Command {
    content?: string;       // command.md 内容
    readmeContent?: string; // README.md 内容
}

/**
 * Commands 管理器
 * 负责读取和管理 Claude Code Commands
 */
export class CommandsManager {
    private static instance: CommandsManager;
    private cachedCommands: Command[] | null = null;
    private lastLoadTime: number = 0;

    private constructor() {}

    /**
     * 获取单例实例
     */
    public static getInstance(): CommandsManager {
        if (!CommandsManager.instance) {
            CommandsManager.instance = new CommandsManager();
        }
        return CommandsManager.instance;
    }

    /**
     * 加载所有 Commands
     * @param forceReload 是否强制重新加载
     * @returns Commands 列表
     */
    public async loadCommands(forceReload: boolean = false): Promise<Command[]> {
        // 使用缓存
        if (this.cachedCommands && !forceReload) {
            console.log('[CommandsManager] Returning cached commands');
            return this.cachedCommands;
        }

        console.log('[CommandsManager] Loading commands');

        try {
            const homeDir = os.homedir();
            const commandsPath = path.join(homeDir, '.claude', 'commands');

            const commands = await this.loadCommandsFromDirectory(commandsPath);

            // 更新缓存
            this.cachedCommands = commands;
            this.lastLoadTime = Date.now();

            console.log(`[CommandsManager] Successfully loaded ${commands.length} command(s)`);
            return commands;

        } catch (error) {
            console.error('[CommandsManager] Failed to load commands:', error);
            this.cachedCommands = [];
            return [];
        }
    }

    /**
     * 从指定目录加载 commands
     */
    private async loadCommandsFromDirectory(dirPath: string): Promise<Command[]> {
        const commands: Command[] = [];

        try {
            if (!fs.existsSync(dirPath)) {
                return commands;
            }

            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                if (!file.endsWith('.md')) {
                    continue;
                }

                const commandPath = path.join(dirPath, file);
                const commandName = path.basename(file, '.md');
                const readmePath = path.join(dirPath, commandName, 'README.md');

                try {
                    // 读取 command.md 内容，提取描述
                    const content = fs.readFileSync(commandPath, 'utf-8');
                    const description = this.extractDescription(content);

                    const command: Command = {
                        name: commandName,
                        path: commandPath,
                        description,
                        hasReadme: fs.existsSync(readmePath)
                    };

                    commands.push(command);
                } catch (error) {
                    console.error(`[CommandsManager] Error parsing command: ${file}`, error);
                }
            }

        } catch (error) {
            console.error(`[CommandsManager] Error reading directory: ${dirPath}`, error);
        }

        return commands;
    }

    /**
     * 从 Markdown 内容提取描述
     */
    private extractDescription(content: string): string | undefined {
        // 尝试从 frontmatter 提取
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const descMatch = frontmatter.match(/description:\s*(.+)/);
            if (descMatch) {
                return descMatch[1].trim();
            }
        }

        // 尝试从第一行标题提取
        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch) {
            return titleMatch[1].trim();
        }

        return undefined;
    }

    /**
     * 获取 Command 详细信息
     */
    public async getCommandDetails(commandName: string): Promise<CommandDetails | null> {
        try {
            const commands = await this.loadCommands();
            const command = commands.find(c => c.name === commandName);

            if (!command) {
                console.warn(`[CommandsManager] Command not found: ${commandName}`);
                return null;
            }

            const details: CommandDetails = { ...command };

            // 读取 command.md 内容
            if (fs.existsSync(command.path)) {
                details.content = fs.readFileSync(command.path, 'utf-8');
            }

            // 读取 README.md（如果存在）
            const homeDir = os.homedir();
            const readmePath = path.join(homeDir, '.claude', 'commands', commandName, 'README.md');
            if (fs.existsSync(readmePath)) {
                details.readmeContent = fs.readFileSync(readmePath, 'utf-8');
            }

            return details;

        } catch (error) {
            console.error('[CommandsManager] Failed to get command details:', error);
            return null;
        }
    }

    /**
     * 搜索 Commands
     */
    public async searchCommands(query: string): Promise<Command[]> {
        const commands = await this.loadCommands();
        const lowerQuery = query.toLowerCase();

        return commands.filter(command => {
            const matchesName = command.name.toLowerCase().includes(lowerQuery);
            const matchesDescription = command.description?.toLowerCase().includes(lowerQuery);

            return matchesName || matchesDescription;
        });
    }

    /**
     * 清除缓存
     */
    public clearCache(): void {
        this.cachedCommands = null;
        this.lastLoadTime = 0;
        console.log('[CommandsManager] Cache cleared');
    }

    /**
     * 获取缓存的 Commands
     */
    public getCachedCommands(): Command[] {
        return this.cachedCommands || [];
    }
}
