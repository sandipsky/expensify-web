import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileUpload, RejectReason, UploadFile } from './file-upload';

@Component({
  imports: [FileUpload],
  template: `
    <l-file-upload
      variant="button"
      buttonLabel="Add receipt"
      accept="image/*,.pdf"
      [listFiles]="listFiles()"
      [maxCount]="2"
      (added)="added.push($event)"
      (rejected)="rejected.push($event.reason)"
    />
  `,
})
class Host {
  readonly listFiles = signal(false);
  readonly added: UploadFile[][] = [];
  readonly rejected: RejectReason[] = [];
}

describe('FileUpload', () => {
  const pick = (el: HTMLElement, files: File[]) => {
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

  it('labels the button trigger', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.l-upload__trigger').textContent).toContain(
      'Add receipt',
    );
  });

  it('hands picks on without keeping or listing them when listFiles is off', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    pick(el, [photo('a.jpg'), new File(['x'], 'b.txt', { type: 'text/plain' })]);
    pick(el, [photo('c.jpg'), photo('d.jpg'), photo('e.jpg')]);
    fixture.detectChanges();

    const host = fixture.componentInstance;
    expect(host.added.map((batch) => batch.map((f) => f.name))).toEqual([
      ['a.jpg'],
      ['c.jpg', 'd.jpg'],
    ]);
    expect(host.rejected).toEqual(['type', 'count']);
    expect(el.querySelector('.l-upload__files')).toBeNull();
  });

  it('lists what was picked by default', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.listFiles.set(true);
    await fixture.whenStable();
    pick(fixture.nativeElement, [new File(['x'], 'bill.pdf', { type: 'application/pdf' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.l-upload__files').textContent).toContain(
      'bill.pdf',
    );
  });
});
