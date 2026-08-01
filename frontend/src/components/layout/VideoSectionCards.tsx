import { SectionCards } from './SectionCards';

interface VideoSectionCardsProps {
  reopenFor?: string | null;
  onSelect: (tab: string) => void;
  onBack?: () => void;
}

export const VideoSectionCards = ({ onSelect, onBack, reopenFor }: VideoSectionCardsProps) => (
  <SectionCards
    reopenFor={reopenFor}
    area="video"
    kicker="Video Studio"
    title="Choose a video model"
    onSelect={onSelect}
    onBack={onBack}
  />
);
