'use client';

import { useEffect } from 'react';

interface UseDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  lockScroll?: boolean;
}

/**
 * Hook for accessible modals, drawers, and popovers:
 * - Listens for the Escape key to close the dialog
 * - Locks body scroll while open to prevent scroll bleed
 */
export function useDialog(
  optionsOrIsOpen: UseDialogOptions | boolean,
  maybeOnClose?: () => void,
  maybeLockScroll: boolean = true
) {
  const isOpen = typeof optionsOrIsOpen === 'boolean' ? optionsOrIsOpen : optionsOrIsOpen.isOpen;
  const onClose = typeof optionsOrIsOpen === 'boolean' ? (maybeOnClose || (() => {})) : optionsOrIsOpen.onClose;
  const lockScroll = typeof optionsOrIsOpen === 'boolean' ? (maybeLockScroll ?? true) : (optionsOrIsOpen.lockScroll ?? true);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    let originalOverflow = '';
    if (lockScroll && typeof document !== 'undefined') {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (lockScroll && typeof document !== 'undefined') {
        document.body.style.overflow = originalOverflow;
      }
    };
  }, [isOpen, onClose, lockScroll]);
}
