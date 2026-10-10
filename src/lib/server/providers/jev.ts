import { z } from 'zod';
import { config } from '../config';
import { HttpError } from '../errors';
import { upstreamFetch } from './http';
import { emitTrace } from './prism';

/** TypeSafe Jev question primitives (https://api.typesafe.ai/v1/systemone). */
export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };

const answerSchema = z.object({
  type: z.string(),
  choice: z.string().optional(),
  score: z.number().optional(),
  noul: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  probabilities: z.record(z.string(), z.number()).optional(),
}).loose();

const responseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), answerSchema),
});

export type JevAnswers = z.infer<typeof responseSchema>;

export async function askJev(state: string, questions: Record<string, JevQuestion>, opts: { sessionId?: string } = {}): Promise<JevAnswers> {
  const started = Date.now();
  const input = [{ role: 'user', content: `${state.slice(0, 8000)}\n\nQuestions: ${JSON.stringify(questions)}` }];
  try {
    const answers = await askJevInner(state, questions);
    void emitTrace({ model: `typesafe/${answers.model}`, input, output: JSON.stringify(answers.answers), latencyMs: Date.now() - started, sessionId: opts.sessionId });
    return answers;
  } catch (err) {
    void emitTrace({ model: `typesafe/${config().typesafe.model}`, input, output: `ERROR ${(err as { code?: string }).code ?? ''}: ${(err as Error).message}`, latencyMs: Date.now() - started, sessionId: opts.sessionId });
    throw err;
  }
}

async function askJevInner(state: string, questions: Record<string, JevQuestion>): Promise<JevAnswers> {
  const { apiKey, baseUrl, model } = config().typesafe;
  if (!apiKey) throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED', 'TYPESAFE_API_KEY is not configured on the server.');
  const res = await upstreamFetch('TypeSafe Jev', `${baseUrl}/v1/systemone`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, state: state.slice(0, 8000), questions }),
  }, { timeoutMs: 15_000, retries: 2 });
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new HttpError(502, 'UPSTREAM_INVALID_OUTPUT', 'TypeSafe Jev returned an unexpected response.');
  for (const [key, question] of Object.entries(questions)) {
    const answer = parsed.data.answers[key];
    const valid = answer && answer.type === question.type && (question.type === 'choice'
      ? answer.choice !== undefined && Object.hasOwn(question.criteria, answer.choice)
      : question.type === 'score' ? answer.score !== undefined
        : answer.noul !== undefined && answer.noul >= 0 && answer.noul <= 1);
    if (!valid) throw new HttpError(502, 'UPSTREAM_INVALID_OUTPUT', `TypeSafe Jev did not return a valid ${key} answer.`);
  }
  return parsed.data;
}
