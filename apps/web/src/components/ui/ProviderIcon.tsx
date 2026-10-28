import React from 'react';
import { Cpu, Bot } from 'lucide-react';

import openaiSvg from '../../assets/icons/providers/openai.svg';
import claudeSvg from '../../assets/icons/providers/claude.svg';
import anthropicSvg from '../../assets/icons/providers/anthropic.svg';
import chatgptSvg from '../../assets/icons/providers/chatgpt.svg';
import geminiSvg from '../../assets/icons/providers/gemini.svg';
import ollamaSvg from '../../assets/icons/providers/ollama.svg';
import deepseekSvg from '../../assets/icons/providers/deepseek.svg';
import grokSvg from '../../assets/icons/providers/grok.svg';
import groqSvg from '../../assets/icons/providers/groq.svg';
import mistralSvg from '../../assets/icons/providers/mistral.svg';
import cohereSvg from '../../assets/icons/providers/cohere.svg';
import huggingfaceSvg from '../../assets/icons/providers/huggingface.svg';
import metaSvg from '../../assets/icons/providers/meta.svg';
import perplexitySvg from '../../assets/icons/providers/perplexity.svg';
import replicateSvg from '../../assets/icons/providers/replicate.svg';

const ICON_MAP: Record<string, string> = {
  openai: openaiSvg,
  gpt: openaiSvg,
  chatgpt: chatgptSvg,
  claude: claudeSvg,
  anthropic: anthropicSvg,
  gemini: geminiSvg,
  google: geminiSvg,
  ollama: ollamaSvg,
  deepseek: deepseekSvg,
  grok: grokSvg,
  groq: groqSvg,
  mistral: mistralSvg,
  cohere: cohereSvg,
  huggingface: huggingfaceSvg,
  hf: huggingfaceSvg,
  meta: metaSvg,
  llama: metaSvg,
  perplexity: perplexitySvg,
  replicate: replicateSvg,
};

export interface ProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  provider,
  size = 20,
  className = '',
  style = {},
}) => {
  const normKey = (provider || '').toLowerCase().trim();
  const iconSrc = ICON_MAP[normKey] || ICON_MAP[normKey.replace(/[^a-z0-9]/g, '')];

  if (iconSrc) {
    return (
      <img
        src={iconSrc}
        alt={`${provider} logo`}
        width={size}
        height={size}
        className={`provider-icon ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style,
        }}
        loading="lazy"
      />
    );
  }

  // Fallback for custom or local nodes
  if (normKey.includes('local') || normKey.includes('custom') || normKey.includes('fake')) {
    return <Cpu size={size} className={className} style={{ flexShrink: 0, ...style }} />;
  }

  return <Bot size={size} className={className} style={{ flexShrink: 0, ...style }} />;
};
