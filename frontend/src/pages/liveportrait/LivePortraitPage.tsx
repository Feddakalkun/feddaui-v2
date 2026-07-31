import { Video } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

export const LivePortraitPage = () => (
  <WorkflowPage
    workflowId="liveportrait"
    family="AdvancedLivePortrait"
    capability="Live Portrait"
    description="Animate a still portrait with the motion + expressions of a driving video."
    icon={Video}
    output="video"
    inputs={[
      { key: 'image', kind: 'image', label: 'Portrait', hint: 'The face to animate — click or drop' },
      { key: 'video', kind: 'video', label: 'Driving Video', hint: 'Motion + expressions source' },
    ]}
    settings={[
      { kind: 'slider', key: 'crop_factor', label: 'Crop Factor', min: 1, max: 3, step: 0.1, defaultValue: 1.5 },
      { kind: 'slider', key: 'retarget_eyes', label: 'Eye Retargeting', min: 0, max: 1, step: 0.05, defaultValue: 0 },
      { kind: 'slider', key: 'retarget_mouth', label: 'Mouth Retargeting', min: 0, max: 1, step: 0.05, defaultValue: 0 },
      { kind: 'slider', key: 'frame_rate', label: 'FPS', min: 8, max: 60, defaultValue: 25 },
    ]}
    generateLabel="Animate portrait"
    generatingLabel="Animating…"
    readyMessage="Live portrait ready"
  />
);
