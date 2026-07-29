import { SectionCards } from './SectionCards';

interface ImageSectionCardsProps {
  onSelect: (tab: string) => void;
  onBack?: () => void;
}

export const ImageSectionCards = ({ onSelect, onBack }: ImageSectionCardsProps) => (
  <SectionCards
    area="image"
    kicker="Image Studio"
    title="Choose an image model"
    onSelect={onSelect}
    onBack={onBack}
  />
);
