import { createButton, createInput } from '@xiaohuang/ui';

export type GuestCopyFlowOptions = {
  onStartCopy: (targetClassName: string) => Promise<void>;
};

export function renderGuestCopyPrompt(container: HTMLElement, options: GuestCopyFlowOptions): void {
  const { onStartCopy } = options;
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'guest-copy-flow';

  const prompt = document.createElement('p');
  prompt.className = 'guest-copy-prompt';
  prompt.textContent = '您有本地数据，是否复制到云端班级？';
  wrapper.appendChild(prompt);

  const nameInput = createInput({ placeholder: '班级名称' });
  wrapper.appendChild(nameInput.element);

  const copyBtn = createButton({
    label: '复制到云端',
    kind: 'primary',
    onClick: async () => {
      const name = (nameInput.element as HTMLInputElement).value.trim();
      if (!name) return;
      copyBtn.update({ disabled: true, loading: true });
      try {
        await onStartCopy(name);
      } finally {
        copyBtn.update({ disabled: false, loading: false });
      }
    },
  });
  wrapper.appendChild(copyBtn.element);

  const skipLink = document.createElement('button');
  skipLink.type = 'button';
  skipLink.className = 'guest-copy-skip';
  skipLink.textContent = '跳过';
  skipLink.addEventListener('click', () => {
    wrapper.remove();
  });
  wrapper.appendChild(skipLink);

  const note = document.createElement('p');
  note.className = 'guest-copy-note';
  note.textContent = '本地数据将保留';
  wrapper.appendChild(note);

  container.appendChild(wrapper);
}
