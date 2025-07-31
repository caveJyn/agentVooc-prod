import { useEffect } from 'react';

interface AdSenseUnitProps {
  adSlot: string;
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  className?: string;
}

const AdSenseUnit = ({ adSlot, format = 'auto', className = '' }: AdSenseUnitProps) => {
  useEffect(() => {
    // Only attempt to push ads if the AdSense script is loaded
    if (typeof window !== 'undefined' && window.adsbygoogle) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        console.error('[AdSenseUnit] Error pushing ad:', error);
      }
    } else {
      console.warn('[AdSenseUnit] AdSense script not loaded');
    }
  }, [adSlot]);

  return (
    <div className={`ad-unit ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" // Replace with your actual publisher ID
        data-ad-slot={adSlot}
        data-ad-format={format}
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default AdSenseUnit;