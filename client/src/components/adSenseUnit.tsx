import { useEffect, useRef, useState } from 'react';

interface AdSenseUnitProps {
  adSlot: string;
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  className?: string;
}

// Track if AdSense script is already injected globally
let adSenseScriptLoading = false;
let adSenseScriptLoaded = false;
let adSenseScriptPromise: Promise<void> | null = null;

function loadAdSenseScript(clientId: string) {
  if (adSenseScriptLoaded) return Promise.resolve();

  if (!adSenseScriptPromise) {
    adSenseScriptPromise = new Promise((resolve, reject) => {
      if (adSenseScriptLoading) return;

      adSenseScriptLoading = true;

      const script = document.createElement('script');
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      script.async = true;
      script.crossOrigin = 'anonymous';

      script.onload = () => {
        adSenseScriptLoaded = true;
        resolve();
      };
      script.onerror = (err) => reject(err);

      document.head.appendChild(script);
    });
  }

  return adSenseScriptPromise;
}

const AdSenseUnit = ({ adSlot, format = 'auto', className = '' }: AdSenseUnitProps) => {
  const adRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    // Detect ad blocker
    const testAd = document.createElement('div');
    testAd.className = 'adsbygoogle';
    document.body.appendChild(testAd);
    setTimeout(() => {
      if (testAd.offsetHeight === 0) {
        console.warn('[AdSenseUnit] Ad blocker detected');
      }
      document.body.removeChild(testAd);
    }, 500);

    // Load script once for all components
    loadAdSenseScript('ca-pub-9622114924468888')
      .then(() => {
        setScriptReady(true);
      })
      .catch((err) => {
        console.error('[AdSenseUnit] Failed to load AdSense script', err);
      });
  }, []);

  useEffect(() => {
    if (!scriptReady || !adRef.current) return;

    const rect = adRef.current.getBoundingClientRect();
    console.log(`[AdSenseUnit] Slot ${adSlot} dimensions:`, {
      width: rect.width,
      height: rect.height,
      display: window.getComputedStyle(adRef.current).display,
      visibility: window.getComputedStyle(adRef.current).visibility
    });

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      console.log(`[AdSenseUnit] Ad pushed successfully for slot: ${adSlot}`);
    } catch (error) {
      console.error('[AdSenseUnit] Error pushing ad:', error);
    }
  }, [adSlot, scriptReady]);

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
