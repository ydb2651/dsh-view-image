import { defineTool } from '@deepseek-ai/dsh-tools';
import { settleRun } from '@deepseek-ai/dsh-subagent';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';

export const name = 'view-image';
export const inject = ['settings', 'webServer', 'tools', 'subagents', 'systemPrompt'];

const NS = settingsNamespace('view-image');

const DEFAULTS = { '启用': true, '视觉模型 provider': 'qwen-token-plan-cn', '视觉模型名': 'kimi-k2.6' };
const SCHEMA = z.object({
  '启用': z.boolean().default(true),
  '视觉模型 provider': z.string().default('qwen-token-plan-cn'),
  '视觉模型名': z.string().default('kimi-k2.6'),
});

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.byteLength;
    if (size > 65536) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function outputText(result) {
  const values = result?.output ?? [];
  return values
    .filter((v) => v !== null && typeof v === 'object' && v.type === 'text' && typeof v.text === 'string')
    .map((v) => v.text)
    .join('');
}

export function apply(ctx, config = {}) {
  const subagentProvider = config.provider ?? 'spawn';
  const scope = ctx.settings.register(NS, SCHEMA);
  let disposeTool;

  const tool = defineTool({
    name: 'view_image',
    description: '用视觉模型看一张本地图片并返回文字描述。当纯文本主模型需要「看图」时调用：把图片绝对路径 + 意图发给指定视觉模型（VLM），返回文字结果。',
    parameters: {
      image_path: { type: 'string', required: true, description: '图片文件的绝对路径（PNG / JPEG / WebP / GIF）。' },
      instruction: { type: 'string', required: true, description: '要让视觉模型做什么（如「描述这张图的内容」「读出图里的文字」）。' },
    },
    output: { schema: { type: 'string' } },
    render: (_args, value) => [{ type: 'text', text: value }],
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === undefined) throw new Error('view_image: no calling agent');
      const section = scope.get();
      const visionProvider = section['视觉模型 provider'] ?? 'qwen-token-plan-cn';
      const visionModel = section['视觉模型名'] ?? 'kimi-k2.6';
      const prompt = `使用 read_image 工具读取图片文件 ${args.image_path}，然后${args.instruction}。直接输出结果文字，不要任何额外说明。`;
      const run = await ctx.subagents.start(subagentProvider, {
        label: 'view_image',
        prompt: [{ type: 'text', text: prompt }],
        parent,
        agentOptions: { provider: visionProvider, model: visionModel },
        signal: exec.signal,
      });
      const result = await settleRun(run);
      const text = outputText(result);
      if (result.stopReason !== 'completed') {
        throw new Error(`view_image 子代理异常结束（${String(result.stopReason)}）${text ? '：' + text : ''}`);
      }
      return text;
    },
  });

  const sync = () => {
    const s = scope.get();
    if (s['启用'] === false) {
      if (disposeTool !== undefined) {
        disposeTool();
        disposeTool = undefined;
      }
    } else if (disposeTool === undefined) {
      disposeTool = ctx.tools.register(tool);
    }
  };
  scope.watch(sync);
  sync();

  ctx.systemPrompt.section({
    name: 'tool:view_image',
    order: 116.6,
    text: () => (disposeTool === undefined ? '' : '当你需要查看图片内容时，使用 view_image 工具（传图片绝对路径 + 意图）。不要用 read_image 直接看图。'),
  });

  ctx.webServer.register({
    kind: 'exact',
    path: '/plugins/dsh-view-image/api/models',
    handler: (req, res) => {
      json(res, 200, {
        providers: ['deepseek-official', 'qwen-token-plan-cn', 'deepseek'],
        models: ['kimi-k2.6', 'deepseek-v4-flash', 'deepseek-v4-pro'],
      });
    },
  });

  ctx.webServer.register({
    kind: 'prefix',
    path: '/plugins/dsh-view-image/api',
    handler: async (req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (pathname !== '/plugins/dsh-view-image/api/settings') {
        json(res, 404, { error: 'not-found' });
        return;
      }
      if (req.method === 'GET') {
        json(res, 200, { settings: scope.get() });
        return;
      }
      if (req.method === 'PATCH') {
        try {
          const body = await readJson(req);
          await scope.update(body.patch ?? body);
          json(res, 200, { settings: scope.get() });
        } catch (e) {
          json(res, 400, { error: 'settings-rejected', message: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      res.setHeader('allow', 'GET, PATCH');
      json(res, 405, { error: 'method-not-allowed' });
    },
  });
}
