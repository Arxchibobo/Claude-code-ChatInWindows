import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Skill 位置类型
 */
export type SkillLocation = 'user' | 'project' | 'managed';

/**
 * Skill 数据结构
 */
export interface Skill {
    name: string;           // Skill 名称
    location: SkillLocation; // 位置类型
    path: string;           // 完整路径
    description?: string;   // 描述
    pluginName?: string;    // 如果是 managed skill，来源插件名
    hasReadme: boolean;     // 是否有 README
    hasPrompt: boolean;     // 是否有 prompt.md
}

/**
 * Skill 详情（包含文件内容）
 */
export interface SkillDetails extends Skill {
    skillJson?: any;        // skill.json 内容
    readmeContent?: string; // README.md 内容
    promptContent?: string; // prompt.md 内容
}

/**
 * Skills 管理器
 * 负责读取和管理 Claude Code Skills
 * 支持三个位置：user-level, project-level, managed (插件提供)
 */
export class SkillsManager {
    private static instance: SkillsManager;
    private cachedSkills: Skill[] | null = null;
    private lastLoadTime: number = 0;

    private constructor() {}

    /**
     * 获取单例实例
     */
    public static getInstance(): SkillsManager {
        if (!SkillsManager.instance) {
            SkillsManager.instance = new SkillsManager();
        }
        return SkillsManager.instance;
    }

    /**
     * 加载所有 Skills
     * @param forceReload 是否强制重新加载
     * @returns Skills 列表
     */
    public async loadSkills(forceReload: boolean = false): Promise<Skill[]> {
        // 使用缓存
        if (this.cachedSkills && !forceReload) {
            console.log('[SkillsManager] Returning cached skills');
            return this.cachedSkills;
        }

        console.log('[SkillsManager] Loading skills from all locations');

        try {
            const skills: Skill[] = [];

            // 加载 user-level skills
            const userSkills = await this.loadUserSkills();
            skills.push(...userSkills);

            // 加载 project-level skills
            const projectSkills = await this.loadProjectSkills();
            skills.push(...projectSkills);

            // 加载 managed skills (来自插件)
            const managedSkills = await this.loadManagedSkills();
            skills.push(...managedSkills);

            // 更新缓存
            this.cachedSkills = skills;
            this.lastLoadTime = Date.now();

            console.log(`[SkillsManager] Successfully loaded ${skills.length} skill(s)`);
            return skills;

        } catch (error) {
            console.error('[SkillsManager] Failed to load skills:', error);
            this.cachedSkills = [];
            return [];
        }
    }

    /**
     * 加载 user-level skills (~/.claude/skills/)
     */
    private async loadUserSkills(): Promise<Skill[]> {
        const homeDir = os.homedir();
        const userSkillsPath = path.join(homeDir, '.claude', 'skills');

        return this.loadSkillsFromDirectory(userSkillsPath, 'user');
    }

    /**
     * 加载 project-level skills (.claude/skills/)
     */
    private async loadProjectSkills(): Promise<Skill[]> {
        const cwd = process.cwd();
        const projectSkillsPath = path.join(cwd, '.claude', 'skills');

        return this.loadSkillsFromDirectory(projectSkillsPath, 'project');
    }

    /**
     * 加载 managed skills (来自插件)
     */
    private async loadManagedSkills(): Promise<Skill[]> {
        const skills: Skill[] = [];
        const homeDir = os.homedir();
        const pluginsPath = path.join(homeDir, '.claude', 'plugins', 'marketplaces');

        try {
            if (!fs.existsSync(pluginsPath)) {
                return skills;
            }

            // 遍历所有 marketplace
            const marketplaces = fs.readdirSync(pluginsPath);

            for (const marketplace of marketplaces) {
                const marketplacePath = path.join(pluginsPath, marketplace);
                const pluginsDir = path.join(marketplacePath, 'plugins');

                if (!fs.existsSync(pluginsDir)) {
                    continue;
                }

                // 遍历所有插件
                const plugins = fs.readdirSync(pluginsDir);

                for (const pluginName of plugins) {
                    const pluginPath = path.join(pluginsDir, pluginName);
                    const skillsDir = path.join(pluginPath, 'skills');

                    if (fs.existsSync(skillsDir)) {
                        const pluginSkills = await this.loadSkillsFromDirectory(
                            skillsDir,
                            'managed',
                            pluginName
                        );
                        skills.push(...pluginSkills);
                    }
                }
            }

        } catch (error) {
            console.error('[SkillsManager] Error loading managed skills:', error);
        }

        return skills;
    }

    /**
     * 从指定目录加载 skills
     */
    private async loadSkillsFromDirectory(
        dirPath: string,
        location: SkillLocation,
        pluginName?: string
    ): Promise<Skill[]> {
        const skills: Skill[] = [];

        try {
            if (!fs.existsSync(dirPath)) {
                return skills;
            }

            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) {
                    continue;
                }

                const skillPath = path.join(dirPath, entry.name);
                const skillJsonPath = path.join(skillPath, 'skill.json');
                const readmePath = path.join(skillPath, 'README.md');
                const promptPath = path.join(skillPath, 'prompt.md');

                // skill.json 是必需的
                if (!fs.existsSync(skillJsonPath)) {
                    continue;
                }

                try {
                    const skillJsonContent = fs.readFileSync(skillJsonPath, 'utf-8');
                    const skillJson = JSON.parse(skillJsonContent);

                    const skill: Skill = {
                        name: entry.name,
                        location,
                        path: skillPath,
                        description: skillJson.description || undefined,
                        pluginName: pluginName,
                        hasReadme: fs.existsSync(readmePath),
                        hasPrompt: fs.existsSync(promptPath)
                    };

                    skills.push(skill);
                } catch (error) {
                    console.error(`[SkillsManager] Error parsing skill: ${entry.name}`, error);
                }
            }

        } catch (error) {
            console.error(`[SkillsManager] Error reading directory: ${dirPath}`, error);
        }

        return skills;
    }

    /**
     * 获取 Skill 详细信息
     * @param skillName Skill 名称
     * @param location Skill 位置
     * @returns Skill 详情
     */
    public async getSkillDetails(skillName: string, location: SkillLocation): Promise<SkillDetails | null> {
        try {
            // 先从缓存中找到对应的 skill
            const skills = await this.loadSkills();
            const skill = skills.find(s => s.name === skillName && s.location === location);

            if (!skill) {
                console.warn(`[SkillsManager] Skill not found: ${skillName} (${location})`);
                return null;
            }

            // 读取文件内容
            const skillJsonPath = path.join(skill.path, 'skill.json');
            const readmePath = path.join(skill.path, 'README.md');
            const promptPath = path.join(skill.path, 'prompt.md');

            const details: SkillDetails = { ...skill };

            // 读取 skill.json
            if (fs.existsSync(skillJsonPath)) {
                const content = fs.readFileSync(skillJsonPath, 'utf-8');
                details.skillJson = JSON.parse(content);
            }

            // 读取 README.md
            if (fs.existsSync(readmePath)) {
                details.readmeContent = fs.readFileSync(readmePath, 'utf-8');
            }

            // 读取 prompt.md
            if (fs.existsSync(promptPath)) {
                details.promptContent = fs.readFileSync(promptPath, 'utf-8');
            }

            return details;

        } catch (error) {
            console.error('[SkillsManager] Failed to get skill details:', error);
            return null;
        }
    }

    /**
     * 搜索 Skills
     * @param query 搜索关键词
     * @param locationFilter 位置过滤（可选）
     * @returns 匹配的 Skills
     */
    public async searchSkills(query: string, locationFilter?: SkillLocation): Promise<Skill[]> {
        const skills = await this.loadSkills();
        const lowerQuery = query.toLowerCase();

        return skills.filter(skill => {
            // 位置过滤
            if (locationFilter && skill.location !== locationFilter) {
                return false;
            }

            // 搜索匹配
            const matchesName = skill.name.toLowerCase().includes(lowerQuery);
            const matchesDescription = skill.description?.toLowerCase().includes(lowerQuery);
            const matchesPlugin = skill.pluginName?.toLowerCase().includes(lowerQuery);

            return matchesName || matchesDescription || matchesPlugin;
        });
    }

    /**
     * 清除缓存
     */
    public clearCache(): void {
        this.cachedSkills = null;
        this.lastLoadTime = 0;
        console.log('[SkillsManager] Cache cleared');
    }

    /**
     * 获取缓存的 Skills
     */
    public getCachedSkills(): Skill[] {
        return this.cachedSkills || [];
    }
}
