export type SingleLinkShareContent = {
  title: string;
  message: string;
  url?: string;
};

type SingleLinkShareInput = {
  title: string;
  message: string;
  url: string;
  platform: string;
  androidLinkText?: string;
};

export function buildSingleLinkShareContent({
  title,
  message,
  url,
  platform,
  androidLinkText,
}: SingleLinkShareInput): SingleLinkShareContent {
  if (platform === 'ios') {
    return {
      title,
      message: [message.trimEnd(), url].filter(Boolean).join('\n'),
    };
  }

  return {
    title,
    message: [message, androidLinkText || url].filter(Boolean).join('\n\n'),
  };
}
