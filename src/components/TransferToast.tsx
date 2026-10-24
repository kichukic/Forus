// Pushes transfer news into the shared toast bus. It renders nothing itself.
import { useEffect } from 'react';
import { onNotice } from '../data/transfers';
import { showToast } from '../data/toasts';
import type { Transfer } from '../data/transfers';

type Props = {
  onPlay: (transfer: Transfer) => void;
  onOpenTorbox: () => void;
};

export function TransferToast({ onPlay, onOpenTorbox }: Props) {
  useEffect(() => {
    const off = onNotice((n) => {
      if (n.kind === 'added') {
        showToast({
          text: `${n.transfer.title} will be added to your TorBox — it plays here when it's ready.`,
          icon: 'cloud-upload-outline',
          duration: 4000,
        });
      } else if (n.kind === 'ready') {
        showToast({
          text: `${n.transfer.title} is ready in your TorBox.`,
          icon: 'checkmark-circle',
          action: { label: 'Play', onPress: () => onPlay(n.transfer) },
          duration: 6000,
        });
      } else if (n.kind === 'error') {
        showToast({
          text: n.transfer.message ?? 'Something went wrong with that transfer.',
          icon: 'alert-circle',
          duration: 5000,
        });
      } else if (n.kind === 'needsKey') {
        showToast({
          text: 'Connect your TorBox to add releases to it.',
          icon: 'key-outline',
          action: { label: 'Connect', onPress: onOpenTorbox },
          duration: 6000,
        });
      }
    });
    return off;
  }, [onPlay, onOpenTorbox]);

  return null;
}
