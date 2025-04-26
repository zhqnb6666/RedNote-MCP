#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { AuthManager } from './auth/authManager'
import { RedNoteTools } from './tools/rednoteTools'
import logger, { LOGS_DIR, packLogs } from './utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createStdioLogger } from './utils/stdioLogger'

const execAsync = promisify(exec)

// 默认参数配置
const DEFAULT_TIMEOUT = 30000 // 默认超时时间30秒

// 尝试从环境变量或命令行获取超时配置
const getConfiguredTimeout = () => {
  // 优先从环境变量读取
  if (process.env.REDNOTE_TIMEOUT) {
    const envTimeout = parseInt(process.env.REDNOTE_TIMEOUT, 10)
    if (!isNaN(envTimeout) && envTimeout > 0) {
      return envTimeout
    }
  }
  
  // 从命令行参数读取
  const timeoutArg = process.argv.find(arg => arg.startsWith('--timeout='))
  if (timeoutArg) {
    const timeoutValue = parseInt(timeoutArg.split('=')[1], 10)
    if (!isNaN(timeoutValue) && timeoutValue > 0) {
      return timeoutValue
    }
  }
  
  return DEFAULT_TIMEOUT
}

const timeout = getConfiguredTimeout()
logger.info(`Using timeout: ${timeout}ms`)
const tools = new RedNoteTools(timeout)

const name = 'rednote'
const description =
  'A friendly tool to help you access and interact with Xiaohongshu (RedNote) content through Model Context Protocol.'
const version = '0.2.2'

// Create server instance
const server = new McpServer({
  name,
  version,
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: true,
    sampling: {},
    roots: {
      listChanged: true
    }
  },
  toolTimeout: timeout, // 设置MCP工具执行超时时间
  onError: (error, ctx) => {
    // 处理错误，添加超时时间信息
    logger.error(`Tool error: ${error.message}`, { context: ctx })
    
    // 如果是超时错误，添加具体的超时时间
    if (error.code === -32001) { // 超时错误代码
      const toolTimeout = ctx.timeout || timeout
      return {
        code: error.code,
        message: `请求超时 (${toolTimeout}ms)`,
        data: { timeout: toolTimeout }
      }
    }
    return error
  }
})

// Register tools
server.tool(
  'search_notes',
  '根据关键词搜索笔记',
  {
    keywords: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('返回结果数量限制'), 
    timeout: z.number().optional().describe('操作超时时间（毫秒）')
  },
  async ({ keywords, limit = 10, timeout }: { keywords: string; limit?: number; timeout?: number }, context) => {
    const operationTimeout = timeout || DEFAULT_TIMEOUT
    
    // 更新上下文中的超时信息，用于错误处理
    if (context) {
      context.timeout = operationTimeout
    }
    
    logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}, timeout: ${operationTimeout}ms`)
    try {
      // 创建AbortController用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(`搜索操作超时 (${operationTimeout}ms)`);
      }, operationTimeout);
      
      try {
        const notes = await Promise.race([
          tools.searchNotes(keywords, limit, operationTimeout),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error(`搜索操作超时 (${operationTimeout}ms)`));
            });
          })
        ]);
        
        clearTimeout(timeoutId);
        logger.info(`Found ${notes.length} notes`);
        
        return {
          content: notes.map((note) => ({
            type: 'text',
            text: `标题: ${note.title}\n作者: ${note.author}\n内容: ${note.content}\n点赞: ${note.likes}\n评论: ${note.comments}\n链接: ${note.url}\n---`
          }))
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      logger.error('Error searching notes:', error);
      throw error;
    }
  }
)

server.tool(
  'get_note_content',
  '获取笔记内容',
  {
    url: z.string().describe('笔记 URL'),
    timeout: z.number().optional().describe('操作超时时间（毫秒）')
  },
  async ({ url, timeout }: { url: string; timeout?: number }, context) => {
    const operationTimeout = timeout || DEFAULT_TIMEOUT
    
    // 更新上下文中的超时信息，用于错误处理
    if (context) {
      context.timeout = operationTimeout
    }
    
    logger.info(`Getting note content for URL: ${url}, timeout: ${operationTimeout}ms`)
    try {
      // 创建AbortController用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(`获取笔记内容超时 (${operationTimeout}ms)`);
      }, operationTimeout);
      
      try {
        const note = await Promise.race([
          tools.getNoteContent(url, operationTimeout),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error(`获取笔记内容超时 (${operationTimeout}ms)`));
            });
          })
        ]);
        
        clearTimeout(timeoutId);
        logger.info(`Successfully retrieved note: ${note.title}`);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(note)
            }
          ]
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      logger.error('Error getting note content:', error);
      throw error;
    }
  }
)

server.tool(
  'get_note_comments',
  '获取笔记评论',
  {
    url: z.string().describe('笔记 URL'),
    timeout: z.number().optional().describe('操作超时时间（毫秒）')
  },
  async ({ url, timeout }: { url: string; timeout?: number }, context) => {
    const operationTimeout = timeout || DEFAULT_TIMEOUT
    
    // 更新上下文中的超时信息，用于错误处理
    if (context) {
      context.timeout = operationTimeout
    }
    
    logger.info(`Getting comments for URL: ${url}, timeout: ${operationTimeout}ms`)
    try {
      // 创建AbortController用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(`获取评论超时 (${operationTimeout}ms)`);
      }, operationTimeout);
      
      try {
        const comments = await Promise.race([
          tools.getNoteComments(url, operationTimeout),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error(`获取评论超时 (${operationTimeout}ms)`));
            });
          })
        ]);
        
        clearTimeout(timeoutId);
        logger.info(`Found ${comments.length} comments`);
        
        return {
          content: comments.map((comment) => ({
            type: 'text',
            text: `作者: ${comment.author}\n内容: ${comment.content}\n点赞: ${comment.likes}\n时间: ${comment.time}\n---`
          }))
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      logger.error('Error getting note comments:', error);
      throw error;
    }
  }
)

// Add login tool
server.tool('login', '登录小红书账号', {}, async () => {
  logger.info('Starting login process')
  const authManager = new AuthManager()
  try {
    await authManager.login()
    logger.info('Login successful')
    return {
      content: [
        {
          type: 'text',
          text: '登录成功！Cookie 已保存。'
        }
      ]
    }
  } catch (error) {
    logger.error('Login failed:', error)
    throw error
  } finally {
    await authManager.cleanup()
  }
})

// Start the server
async function main() {
  logger.info('Starting RedNote MCP Server')

  // Start stdio logging
  const stopLogging = createStdioLogger(`${LOGS_DIR}/stdio.log`)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('RedNote MCP Server running on stdio')

  // Cleanup on process exit
  process.on('exit', () => {
    stopLogging()
  })
}

// 检查是否在 stdio 模式下运行
if (process.argv.includes('--stdio')) {
  main().catch((error) => {
    logger.error('Fatal error in main():', error)
    process.exit(1)
  })
} else {
  const { Command } = require('commander')
  const program = new Command()

  program.name(name).description(description).version(version)
  
  // 全局选项 - 超时设置
  program.option('--timeout <ms>', '设置操作超时时间（毫秒）', DEFAULT_TIMEOUT.toString())

  program
    .command('init')
    .description('Initialize and login to RedNote')
    .action(async () => {
      logger.info('Starting initialization process')
      try {
        const authManager = new AuthManager()
        await authManager.login()
        await authManager.cleanup()
        logger.info('Initialization successful')
        console.log('Login successful! Cookie has been saved.')
        process.exit(0)
      } catch (error) {
        logger.error('Error during initialization:', error)
        console.error('Error during initialization:', error)
        process.exit(1)
      }
    })

  program
    .command('pack-logs')
    .description('Pack all log files into a zip file')
    .action(async () => {
      try {
        const zipPath = await packLogs()
        console.log(`日志已打包到: ${zipPath}`)
        process.exit(0)
      } catch (error) {
        console.error('打包日志失败:', error)
        process.exit(1)
      }
    })

  program
    .command('open-logs')
    .description('Open the logs directory in file explorer')
    .action(async () => {
      try {
        let command
        switch (process.platform) {
          case 'darwin': // macOS
            command = `open "${LOGS_DIR}"`
            break
          case 'win32': // Windows
            command = `explorer "${LOGS_DIR}"`
            break
          case 'linux': // Linux
            command = `xdg-open "${LOGS_DIR}"`
            break
          default:
            throw new Error(`Unsupported platform: ${process.platform}`)
        }

        await execAsync(command)
        console.log(`日志目录已打开: ${LOGS_DIR}`)
        process.exit(0)
      } catch (error) {
        console.error('打开日志目录失败:', error)
        process.exit(1)
      }
    })

  program.parse(process.argv)
}
