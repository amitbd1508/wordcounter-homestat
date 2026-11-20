import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            install();
          } else {
            setShowModal(true);
          }
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{isIOS ? 'Install on iPhone' : 'Install App'}</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 id="pwa-install-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Install VoxPi Mobile App
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close install instructions"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Access your Raspberry Pi speech analytics dashboard as a standalone native-like app on iOS or Android:
            </p>
            <ol className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside">
              <li>
                On <strong>iPhone / iOS Safari</strong>: Tap the <strong>Share</strong> icon in the bottom bar and select <strong>Add to Home Screen</strong>.
              </li>
              <li>
                On <strong>Android / Chrome</strong>: Tap the browser menu or address bar install icon and select <strong>Install App</strong>.
              </li>
              <li>
                Ensure your mobile device is on your local Wi-Fi or connected via WireGuard / Tailscale VPN to your Raspberry Pi node.
              </li>
            </ol>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-700"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
