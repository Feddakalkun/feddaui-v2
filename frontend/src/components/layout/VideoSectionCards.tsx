import { SectionCards } from './SectionCards';

interface VideoSectionCardsProps {
  onSelect: (tab: string) => void;
  onBack?: () => void;
}

export const VideoSectionCards = ({ onSelect, onBack }: VideoSectionCardsProps) => (
  <SectionCards
    area="video"
    kicker="Video Studio"
    title="Choose a video model"
    onSelect={onSelect}
    onBack={onBack}
  />
);
