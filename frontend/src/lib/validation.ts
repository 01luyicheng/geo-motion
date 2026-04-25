import { z } from 'zod';

// ── 通用验证规则 ───────────────────────────────────────────────

/** data:image/ 开头的 base64 或 URL 编码图片 */
const dataUriRegex =
  /^data:image\/(png|jpeg|jpg|gif|webp);(base64,[A-Za-z0-9+/=]+|charset=[^,]+,.+)$/;

export const imageDataUriSchema = z
  .string()
  .min(1, '图片不能为空')
  .refine((val) => val.startsWith('data:image/'), {
    message: '图片格式错误，需为 data URI',
  })
  .refine((val) => dataUriRegex.test(val), {
    message: '图片格式无效，需为 base64 或 URL 编码的 data URI',
  })
  .refine((val) => val.length <= 13_000_000, {
    message: '图片大小超过 10MB 限制',
  });

/** 非空字符串（去空白后） */
export const nonEmptyStringSchema = z.string().min(1, '内容不能为空').transform((s) => s.trim());

/** 可选的非空字符串 */
export const optionalNonEmptyStringSchema = z
  .string()
  .optional()
  .transform((s) => (s ? s.trim() : s));

// ── API 路由请求体验证 Schema ─────────────────────────────────

/** POST /api/analyze */
export const analyzeRequestSchema = z.object({
  image: imageDataUriSchema,
  retryCount: z.number().int().min(0).max(5).optional(),
  previousError: z.string().max(2000).optional(),
});

export type AnalyzeRequestInput = z.infer<typeof analyzeRequestSchema>;

/** POST /api/generate-graphic */
export const generateGraphicRequestSchema = z.object({
  text: nonEmptyStringSchema,
  sketch: imageDataUriSchema.optional(),
  retryCount: z.number().int().min(0).max(5).optional(),
  previousError: z.string().max(2000).optional(),
});

export type GenerateGraphicRequestInput = z.infer<typeof generateGraphicRequestSchema>;

/** POST /api/fix-commands */
export const fixCommandsRequestSchema = z.object({
  originalCommands: nonEmptyStringSchema,
  errors: z
    .array(
      z.object({
        command: z.string().min(1),
        error: z.string().min(1),
        index: z.number().int().min(0),
      })
    )
    .min(1, '至少提供一条错误信息'),
  conditions: z.array(z.string().min(1)).max(50).optional(),
  goal: z.string().max(2000).optional(),
  retryCount: z.number().int().min(0).max(5).optional(),
});

export type FixCommandsRequestInput = z.infer<typeof fixCommandsRequestSchema>;

/** POST /api/save-result */
export const saveResultRequestSchema = z.object({
  result: z.object(
    {
      id: z.string().min(1),
      geogebra: z.string().min(1).max(50000, 'GeoGebra 数据超过最大长度限制'),
      conditions: z.array(z.string().max(500, '条件项超过最大长度限制')).max(100, '条件数量超过最大限制'),
      goal: z.string().max(2000, '目标描述超过最大长度限制'),
      solution: z.array(
        z.union([
          z.string(),
          z.object({
            text: z.string().max(5000, '解答文本超过最大长度限制'),
            commandIndices: z.array(z.number()),
            explanation: z.string().max(5000, '解答说明超过最大长度限制').optional(),
          }),
        ])
      ).max(200, '解答步骤数量超过最大限制').optional(),
      createdAt: z.string(),
    },
    { required_error: '未提供分析结果' }
  ),
});

export type SaveResultRequestInput = z.infer<typeof saveResultRequestSchema>;

// ── 辅助函数 ──────────────────────────────────────────────────

/**
 * 安全解析 JSON 请求体
 * 在 Next.js API Route 中使用，避免重复读取 body
 */
export async function safeParseJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; error: { code: string; message: string; details?: z.ZodIssue[] } }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      success: false,
      error: { code: 'INVALID_JSON', message: '请求体不是有效的 JSON' },
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const firstMessage = issues[0]?.message ?? '请求参数验证失败';
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: firstMessage,
        details: issues,
      },
    };
  }

  return { success: true, data: parsed.data };
}
