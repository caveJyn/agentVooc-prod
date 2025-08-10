import { useEffect, useRef } from 'react';

interface AdSenseUnitProps {
  adSlot: string;
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  className?: string;
}

const AdSenseUnit = ({ adSlot, format = 'auto', className = '' }: AdSenseUnitProps) => {
  const adRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (adRef.current) {
      const rect = adRef.current.getBoundingClientRect();
      console.log(`[AdSenseUnit] Slot ${adSlot} dimensions:`, {
        width: rect.width,
        height: rect.height,
        display: window.getComputedStyle(adRef.current).display,
        visibility: window.getComputedStyle(adRef.current).visibility
      });
    }

    if (typeof window !== 'undefined' && window.adsbygoogle) {
      try {
        console.log(`[AdSenseUnit] Pushing ad for slot: ${adSlot}`);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        console.error('[AdSenseUnit] Error pushing ad:', error);
      }
    } else {
      console.warn('[AdSenseUnit] AdSense script not loaded for slot:', adSlot);
    }
  }, [adSlot]);

  return (
    <div
      ref={adRef}
      className={`ad-container ${className}`}
      style={{ minWidth: '300px', minHeight: '100px', display: 'block', visibility: 'visible' }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: 'auto' }}
        data-ad-client="ca-pub-9622114924468888"
        data-ad-slot={adSlot}
        data-ad-format={format}
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default AdSenseUnit;