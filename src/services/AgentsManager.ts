import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Agent 数据结构
 */
export interface Agent {
    name: string;           // Agent 名称
    path: string;           // 完整路径
    description?: string;   // 描述
    hasReadme: boolean;     // 是否有 README
}

/**
 * Agent 详情
 */
export interface AgentDetails extends Agent {
    content?: string;       // agent.md 内容
    readmeContent?: string; // README.md 内容
}

/**
 * Agents 管理器
 * 负责读取和管理 Claude Code Agents
 */
export class AgentsManager {
    private static instance: AgentsManager;
    private cachedAgents: Agent[] | null = null;
    private lastLoadTime: number = 0;

    private constructor() {}

    /**
     * 获取单例实例
     */
    public static getInstance(): AgentsManager {
        if (!AgentsManager.instance) {
            AgentsManager.instance = new AgentsManager();
        }
        return AgentsManager.instance;
    }

    /**
     * 加载所有 Agents
     * @param forceReload 是否强制重新加载
     * @returns Agents 列表
     */
    public async loadAgents(forceReload: boolean = false): Promise<Agent[]> {
        // 使用缓存
        if (this.cachedAgents && !forceReload) {
            console.log('[AgentsManager] Returning cached agents');
            return this.cachedAgents;
        }

        console.log('[AgentsManager] Loading agents');

        try {
            const homeDir = os.homedir();
            const agentsPath = path.join(homeDir, '.claude', 'agents');

            const agents = await this.loadAgentsFromDirectory(agentsPath);

            // 更新缓存
            this.cachedAgents = agents;
            this.lastLoadTime = Date.now();

            console.log(`[AgentsManager] Successfully loaded ${agents.length} agent(s)`);
            return agents;

        } catch (error) {
            console.error('[AgentsManager] Failed to load agents:', error);
            this.cachedAgents = [];
            return [];
        }
    }

    /**
     * 从指定目录加载 agents
     */
    private async loadAgentsFromDirectory(dirPath: string): Promise<Agent[]> {
        const agents: Agent[] = [];

        try {
            if (!fs.existsSync(dirPath)) {
                return agents;
            }

            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                if (!file.endsWith('.md')) {
                    continue;
                }

                const agentPath = path.join(dirPath, file);
                const agentName = path.basename(file, '.md');
                const readmePath = path.join(dirPath, agentName, 'README.md');

                try {
                    // 读取 agent.md 内容，提取描述
                    const content = fs.readFileSync(agentPath, 'utf-8');
                    const description = this.extractDescription(content);

                    const agent: Agent = {
                        name: agentName,
                        path: agentPath,
                        description,
                        hasReadme: fs.existsSync(readmePath)
                    };

                    agents.push(agent);
                } catch (error) {
                    console.error(`[AgentsManager] Error parsing agent: ${file}`, error);
                }
            }

        } catch (error) {
            console.error(`[AgentsManager] Error reading directory: ${dirPath}`, error);
        }

        return agents;
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
     * 获取 Agent 详细信息
     */
    public async getAgentDetails(agentName: string): Promise<AgentDetails | null> {
        try {
            const agents = await this.loadAgents();
            const agent = agents.find(a => a.name === agentName);

            if (!agent) {
                console.warn(`[AgentsManager] Agent not found: ${agentName}`);
                return null;
            }

            const details: AgentDetails = { ...agent };

            // 读取 agent.md 内容
            if (fs.existsSync(agent.path)) {
                details.content = fs.readFileSync(agent.path, 'utf-8');
            }

            // 读取 README.md（如果存在）
            const homeDir = os.homedir();
            const readmePath = path.join(homeDir, '.claude', 'agents', agentName, 'README.md');
            if (fs.existsSync(readmePath)) {
                details.readmeContent = fs.readFileSync(readmePath, 'utf-8');
            }

            return details;

        } catch (error) {
            console.error('[AgentsManager] Failed to get agent details:', error);
            return null;
        }
    }

    /**
     * 搜索 Agents
     */
    public async searchAgents(query: string): Promise<Agent[]> {
        const agents = await this.loadAgents();
        const lowerQuery = query.toLowerCase();

        return agents.filter(agent => {
            const matchesName = agent.name.toLowerCase().includes(lowerQuery);
            const matchesDescription = agent.description?.toLowerCase().includes(lowerQuery);

            return matchesName || matchesDescription;
        });
    }

    /**
     * 清除缓存
     */
    public clearCache(): void {
        this.cachedAgents = null;
        this.lastLoadTime = 0;
        console.log('[AgentsManager] Cache cleared');
    }

    /**
     * 获取缓存的 Agents
     */
    public getCachedAgents(): Agent[] {
        return this.cachedAgents || [];
    }
}
