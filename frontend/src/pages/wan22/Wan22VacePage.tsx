import { PersonStanding } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

export const Wan22VacePage = () => (
  <WorkflowPage
    workflowId="wan22-vace"
    family="Motion Transfer"
    capability="WAN 2.2 VACE"
    description="Full-body motion transfer — animate a reference person with a driving video."
    icon={PersonStanding}
    output="video"
    inputs={[
      { key: 'image', kind: 'image', label: 'Reference Person', hint: 'The person to animate — click or drop' },
      { key: 'video', kind: 'video', label: 'Driving Video', hint: 'Full-body motion source' },
    ]}
    prompt={{
      defaultValue: 'a woman dancing, natural fluid motion, cinematic lighting',
      placeholder: 'Describe the subject and motion…',
      negative: {},
    }}
    settings={[
      {
        kind: 'chips',
        key: 'control_mode',
        label: 'Control Mode',
        defaultValue: 2,
        options: [
          { label: 'Pose (DWPose)', value: 0 },
          { label: 'Depth', value: 1 },
          { label: 'Lotus Depth', value: 2 },
        ],
      },
      { kind: 'slider', key: 'length_seconds', label: 'Length (s)', min: 1, max: 15, defaultValue: 5, asString: true },
      { kind: 'slider', key: 'skip_seconds', label: 'Skip intro (s)', min: 0, max: 30, defaultValue: 0, asString: true },
      { kind: 'slider', key: 'frame_rate', label: 'Frame rate', min: 8, max: 30, defaultValue: 15, asString: true },
      { kind: 'seed', key: 'seed' },
    ]}
    generateLabel="Transfer motion"
    generatingLabel="Transferring…"
    readyMessage="VACE video ready"
  />
);
