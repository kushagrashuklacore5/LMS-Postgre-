import { API_BASE } from '../config/api';
type TranslationResult = {

  en?: string;

  ur?: string;

};



async function translateTo(target: string, text: string, src?: string): Promise<string> {

  try {

    const res = await fetch(`${API_BASE}/translate`, {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ text, sourceLanguage: src || 'auto', targetLanguage: target })

    });

    if (!res.ok) throw new Error('Translation API error');

    const data = await res.json();

    return data.translatedText || text;

  } catch (e) {

    // Fallback: simple mocked suffix to indicate translation

    if (target === 'en') return `${text} (EN)`;

    if (target === 'ur') return `${text} (UR)`;

    return text;

  }

}



export async function translateText(text: string, source = 'auto', targets: string[] = ['en','ur']): Promise<TranslationResult> {

  const out: TranslationResult = {};

  if (!text || text.trim() === '') return out;



  await Promise.all(targets.map(async (t) => {

    const translated = await translateTo(t, text, source === 'auto' ? undefined : source);

    if (t === 'en') out.en = translated;

    if (t === 'ur') out.ur = translated;

  }));



  return out;

}



export default translateText;

