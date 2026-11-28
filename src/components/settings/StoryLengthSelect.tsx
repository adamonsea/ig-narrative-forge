import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STORY_LENGTHS, type FeedStoryLength } from '@/lib/storyLength';
export function StoryLengthSelect({ value, onChange, extended = false }: {
  value: string; onChange: (value: FeedStoryLength) => void; extended?: boolean;
}) {
  return <Select value={value} onValueChange={v => {
    const choice = STORY_LENGTHS.find(p => p.value === v);
    if (choice) onChange(choice.value);
  }}>
    <SelectTrigger aria-label="Story length" className="h-11 w-full text-base sm:w-48"><SelectValue /></SelectTrigger>
    <SelectContent>
      {STORY_LENGTHS.filter(p => extended || p.value !== 'extensive' || value === 'extensive').map(p =>
        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}
