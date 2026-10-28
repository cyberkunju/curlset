export interface DetectedProviderInfo {
  provider: string;
  displayName: string;
  defaultLabel: string;
  defaultModels: string[];
  requiresKey: boolean;
  requiresBaseUrl: boolean;
  defaultBaseUrl?: string;
  placeholderKey: string;
  description: string;
}

export function detectProvider(rawInput: string): DetectedProviderInfo {
  const val = (rawInput || '').trim();
  const lower = val.toLowerCase();

  // 1. Anthropic Claude (keys start with sk-ant-)
  if (val.startsWith('sk-ant-') || lower.includes('claude') || lower.includes('anthropic')) {
    return {
      provider: 'anthropic',
      displayName: 'Anthropic Claude',
      defaultLabel: 'Anthropic Claude API',
      defaultModels: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-haiku-20240307',
        'claude-3-opus-20240229',
      ],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'sk-ant-api03-...',
      description: 'Supports vision, structured classification, and high-reasoning annotation.',
    };
  }

  // 2. Groq (keys start with gsk_)
  if (val.startsWith('gsk_') || lower.includes('groq')) {
    return {
      provider: 'groq',
      displayName: 'Groq Cloud',
      defaultLabel: 'Groq LPU Inference',
      defaultModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'gsk_...',
      description: 'Ultra-fast LPU inference for real-time dataset filtering and batch runs.',
    };
  }

  // 3. Google Gemini (keys start with AIza)
  if (val.startsWith('AIza') || lower.includes('gemini') || lower.includes('google')) {
    return {
      provider: 'gemini',
      displayName: 'Google Gemini',
      defaultLabel: 'Google Gemini API',
      defaultModels: ['gemini-1.5-pro', 'gemini-1.5-flash'],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'AIzaSy...',
      description: 'Massive context window and native multimodal audio/vision labeling.',
    };
  }

  // 4. Hugging Face (keys start with hf_)
  if (val.startsWith('hf_') || lower.includes('huggingface') || lower.includes('hf')) {
    return {
      provider: 'huggingface',
      displayName: 'Hugging Face',
      defaultLabel: 'Hugging Face Hub',
      defaultModels: ['meta-llama/Llama-3.2-3B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3'],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'hf_...',
      description: 'Open source models served via Hugging Face Serverless Inference.',
    };
  }

  // 5. Local Ollama (URLs with localhost:11434, 11434, or keyword ollama/local)
  if (lower.includes('11434') || lower.includes('ollama') || lower.includes('localhost') || lower.includes('127.0.0.1')) {
    return {
      provider: 'ollama',
      displayName: 'Local Ollama',
      defaultLabel: 'Local Ollama Server',
      defaultModels: ['llama3.2', 'mistral', 'qwen2.5', 'phi3'],
      requiresKey: false,
      requiresBaseUrl: true,
      defaultBaseUrl: 'http://localhost:11434',
      placeholderKey: 'No API key needed for local offline server',
      description: 'Runs offline on your workstation with zero external network traffic.',
    };
  }

  // 6. DeepSeek
  if (lower.includes('deepseek')) {
    return {
      provider: 'deepseek',
      displayName: 'DeepSeek',
      defaultLabel: 'DeepSeek API',
      defaultModels: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'sk-...',
      description: 'Cost-effective reasoning and code/text dataset engineering.',
    };
  }

  // 7. Mistral AI
  if (lower.includes('mistral')) {
    return {
      provider: 'mistral',
      displayName: 'Mistral AI',
      defaultLabel: 'Mistral AI Platform',
      defaultModels: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'sk-...',
      description: 'European open & frontier models for multilingual data synthesis.',
    };
  }

  // 8. Cohere
  if (lower.includes('cohere')) {
    return {
      provider: 'cohere',
      displayName: 'Cohere',
      defaultLabel: 'Cohere Enterprise API',
      defaultModels: ['command-r-plus', 'command-r', 'embed-english-v3.0'],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'co-...',
      description: 'Specialized enterprise embeddings and reranking for dataset retrieval.',
    };
  }

  // 9. OpenAI (Default for sk- or openai keywords)
  if (val.startsWith('sk-') || lower.includes('openai') || lower.includes('gpt')) {
    return {
      provider: 'openai',
      displayName: 'OpenAI',
      defaultLabel: 'OpenAI Production Key',
      defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'text-embedding-3-small'],
      requiresKey: true,
      requiresBaseUrl: false,
      placeholderKey: 'sk-proj-...',
      description: 'High-accuracy GPT-4o multimodal vision and structured JSON outputs.',
    };
  }

  // Default unrecognized / generic
  return {
    provider: 'custom',
    displayName: 'OpenAI-Compatible Custom Endpoint',
    defaultLabel: 'Custom Model Gateway',
    defaultModels: ['default-model'],
    requiresKey: true,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:8000/v1',
    placeholderKey: 'API key or Bearer token (optional for local)',
    description: 'Any OpenAI-compatible server: vLLM, LM Studio, LocalAI, or private gateway.',
  };
}
