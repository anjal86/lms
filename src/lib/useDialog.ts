'use client';

import { useEffect, useRef } from 'react';

interface UseDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  lockScroll?: boolean;
}

const NOOP = () => {};
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function activeModalDialog() {
  if (typeof document === 'undefined') return null;
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
  return dialogs.reverse().find((dialog) => {
    const style = window.getComputedStyle(dialog);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }) || null;
}

/**
 * Accessible modal/drawer behavior:
 * - Escape closes the active dialog
 * - Tab/Shift+Tab remain inside the dialog
 * - focus moves into the dialog on open and returns to the opener on close
 * - body scrolling is locked while open
 */
export function useDialog(
  optionsOrIsOpen: UseDialogOptions | boolean,
  maybeOnClose?: () => void,
  maybeLockScroll: boolean = true
) {
  const isOpen = typeof optionsOrIsOpen === 'boolean' ? optionsOrIsOpen : optionsOrIsOpen.isOpen;
  const onClose = typeof optionsOrIsOpen === 'boolean' ? (maybeOnClose || NOOP) : optionsOrIsOpen.onClose;
  const lockScroll = typeof optionsOrIsOpen === 'boolean' ? maybeLockScroll : (optionsOrIsOpen.lockScroll ?? true);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const focusDialog = window.requestAnimationFrame(() => {
      const dialog = activeModalDialog();
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      (focusable[0] || dialog).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = activeModalDialog();
      if (!dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (lockScroll) document.body.style.overflow = originalOverflow;
      if (previousFocus && document.contains(previousFocus)) {
        window.requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
      }
    };
  }, [isOpen, lockScroll]);
}
