import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { ContentVoiceSettings } from '@/components/ContentVoiceSettings';
const db = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ update: db.update }) } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner-test' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Native adapters exercise saving without relying on jsdom's missing pointer/capture APIs.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) =>
    <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: {children: ReactNode}) => <>{children}</>,
  SelectItem: ({ value, children }: {value: string; children: ReactNode}) => <option value={value}>{children}</option>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });
function setup() {
  db.update.mockReturnValue({ eq: db.eq });
  db.eq.mockReturnValue({ select: db.select });
  db.select.mockReturnValue({ single: db.single });
  db.single.mockResolvedValue({ data: { id: 'feed-test' }, error: null });
  render(<ContentVoiceSettings topicId="feed-test" currentStoryLength="standard" currentTone="satirical" currentExpertise="expert" currentWritingStyle="story_driven" currentHouseStyleNotes="Keep our voice." currentHouseStyleExamples="Our example sentence." />);
}
describe('Writing settings save and preserve editorial control', () => {
  it('saves Brief to this feed without changing its existing tone or house style', async () => {
    setup(); fireEvent.change(screen.getAllByRole('combobox')[0] as HTMLElement, { target: { value: 'brief' } });
    await waitFor(() => expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ story_length: 'brief' })));
    expect(db.eq).toHaveBeenCalledWith('id', 'feed-test');
    expect(db.update.mock.calls[0]?.[0]).not.toHaveProperty('default_tone');
    expect(db.update.mock.calls[0]?.[0]).not.toHaveProperty('house_style_notes');
  });
  it('preserves the existing advanced choices without writing them when unfolded', () => {
    setup(); fireEvent.click(screen.getByRole('button', {name:'Advanced'}));
    const values = screen.getAllByRole('combobox').map(el => (el as HTMLSelectElement).value);
    expect(values).toContain('satirical'); expect(values).toContain('expert'); expect(values).toContain('story_driven');
    expect(db.update).not.toHaveBeenCalled();
  });
  it('retains the extended length save for editors who need it', async () => {
    setup(); fireEvent.click(screen.getByRole('button', {name:'Advanced'}));
    const length = screen.getAllByRole('combobox').find(el => Array.from((el as HTMLSelectElement).options).some(o => o.value === 'extensive'));
    if (!length) throw new Error('Extended choice is missing');
    fireEvent.change(length, { target: { value: 'extensive' } });
    await waitFor(() => expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ story_length: 'extensive' })));
  });
  it('restores the previous selection if saving fails', async () => {
    setup(); db.single.mockResolvedValue({ data:null, error: { message:'Not allowed' } });
    fireEvent.change(screen.getAllByRole('combobox')[0] as HTMLElement, {target:{value:'brief'}});
    await waitFor(() => expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('standard'));
  });
});
