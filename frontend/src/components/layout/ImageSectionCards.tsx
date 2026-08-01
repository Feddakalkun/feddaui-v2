import { SectionCards } from './SectionCards';

interface ImageSectionCardsProps {
  reopenFor?: string | null;
  onSelect: (tab: string) => void;
  onBack?: () => void;
}

export const ImageSectionCards = ({ onSelect, onBack, reopenFor }: ImageSectionCardsProps) => (
  <SectionCards
    reopenFor={reopenFor}
    area="image"
    kicker="Image Studio"
    title="Choose an image model"
    onSelect={onSelect}
    onBack={onBack}
  />
);
