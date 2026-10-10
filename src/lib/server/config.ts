/** Server-only configuration. Never import from client components. */
export const DEFAULT_NICRRON_MODEL = 'anthropic/claude-fable-5-1';
export const DEFAULT_JEV_MODEL = 'jev-latest';

export function config() {
  return {
    nicrron: {
      apiKey: process.env.NICRRON_API_KEY ?? '',
      baseUrl: (process.env.NICRRON_BASE_URL ?? 'https://api.nicrron.ai/v1').replace(/\/+$/, ''),
      model: process.env.NICRRON_MODEL || DEFAULT_NICRRON_MODEL,
    },
    typesafe: {
      apiKey: process.env.TYPESAFE_API_KEY ?? '',
      baseUrl: (process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai').replace(/\/+$/, ''),
      model: process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL,
    },
  };
}
