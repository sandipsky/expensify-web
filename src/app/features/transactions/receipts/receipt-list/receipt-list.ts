import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} from '../../../../core/domain/attachments';
import { Preferences } from '../../../../core/preferences';
import { BreakpointService } from '../../../../layout/breakpoint.service';
import { Button } from '../../../../shared/components/ui/button/button';
import { FileUpload, RejectReason, UploadFile } from '../../../../shared/components/ui/file-upload';
import { Icon } from '../../../../shared/components/ui/icon/icon';
import { ModalService } from '../../../../shared/components/ui/modal';
import { NotificationService } from '../../../../shared/components/ui/notification';
import { formatFileSize } from '../receipt-labels';
import { ReceiptDraft, ReceiptItem, ReceiptProblem } from '../receipt-draft';
import {
  ReceiptViewer,
  ReceiptViewerData,
  ReceiptViewerResult,
} from '../receipt-viewer/receipt-viewer';

const PROBLEMS: Readonly<Record<ReceiptProblem, string>> = {
  type: 'Only photos and PDFs can be receipts.',
  size: `Receipts must be under ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
  count: `An entry holds up to ${MAX_ATTACHMENTS} receipts.`,
  failed: "Couldn't upload it. Check your connection and try again.",
};

/**
 * The receipts part of the transaction form (§3.12): thumbnails of what the
 * entry has, a picker for photos and PDFs (ATT-01), and the full-screen viewer
 * on tap (ATT-04). Reads and changes the form's {@link ReceiptDraft}.
 */
@Component({
  selector: 'app-receipt-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, FileUpload, Icon],
  templateUrl: './receipt-list.html',
  styleUrl: './receipt-list.scss',
})
export class ReceiptList {
  protected readonly draft = inject(ReceiptDraft);
  protected readonly breakpoints = inject(BreakpointService);
  private readonly modals = inject(ModalService);
  private readonly notify = inject(NotificationService);

  protected readonly accept = ATTACHMENT_ACCEPT;
  protected readonly max = MAX_ATTACHMENTS;
  protected readonly hint = `Photo or PDF, under ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB, up to ${MAX_ATTACHMENTS}`;
  private readonly locale = inject(Preferences).locale;
  protected readonly size = (bytes: number) => formatFileSize(bytes, this.locale());

  protected async add(picked: UploadFile[]): Promise<void> {
    // Too big and failed uploads show on their tile; the rest never get one.
    const problems = await this.draft.add(picked.map((p) => p.file));
    for (const problem of new Set(problems)) {
      if (problem === 'type' || problem === 'count') this.warn(problem);
    }
  }

  protected rejected(event: { reason: RejectReason }): void {
    this.warn(event.reason === 'type' ? 'type' : event.reason === 'size' ? 'size' : 'count');
  }

  protected problem(item: ReceiptItem): string {
    return PROBLEMS[item.problem ?? 'failed'];
  }

  protected view(item: ReceiptItem): void {
    const items = this.draft.list().filter((i) => i.status === 'ready');
    this.modals
      .open<ReceiptViewer, ReceiptViewerData, ReceiptViewerResult>(ReceiptViewer, {
        data: { items, index: Math.max(0, items.indexOf(item)), removable: true },
        fullscreen: true,
        animation: 'fade',
      })
      .afterClosed()
      .subscribe((result) => {
        if (result?.remove) this.draft.remove(result.remove);
      });
  }

  private warn(problem: ReceiptProblem): void {
    this.notify.warn("Couldn't add that file", PROBLEMS[problem]);
  }
}
