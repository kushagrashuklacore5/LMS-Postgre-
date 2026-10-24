import React from 'react';
import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import guideBotRuntime from './GuideBotRuntime';

/**
 * Accessible button that starts the given portal's registered GuideBot
 * tour via the existing runtime singleton. Intentionally dumb: click ->
 * guideBotRuntime.start(tourId). No state, no context, no second runtime
 * instance, no auto-start. Styled with the app's own Tailwind `primary`
 * token (#2563EB, tailwind.config.js) as a single restrained brand color
 * rather than a loud multi-hue gradient, so it reads as a native, premium
 * part of the product rather than a bolted-on widget.
 *
 * @param {{ tourId: string }} props - tourId is required.
 */
const GuideBotLauncher = ({ tourId }) => {
  const { t } = useTranslation('tours');

  const handleClick = () => {
    guideBotRuntime.start(tourId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t('start_walkthrough', 'Start GuideBot walkthrough')}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-white bg-[#B99652] shadow-[0_2px_8px_rgba(185,150,82,0.25)] hover:bg-[#a38241] hover:shadow-[0_4px_12px_rgba(185,150,82,0.35)] active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#B99652] transition-all duration-200 shrink-0 cursor-pointer"
    >
      <Compass size={15} strokeWidth={2.2} className="shrink-0" />
      <span>{t('guidebot_btn', 'GuideBot')}</span>
    </button>
  );
};

export default GuideBotLauncher;
