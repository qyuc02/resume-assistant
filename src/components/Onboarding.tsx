import { useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';

export default function Onboarding({
  onClose,
  goArchive,
  goResume,
  goTracker,
}: {
  onClose: () => void;
  goArchive: () => void;
  goResume: () => void;
  goTracker: () => void;
}) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: '1. 记下真实经历',
      desc: '在「经历档案」把每段经历当作事实记一次，之后反复复用，讲法各不相同。',
      icon: 'folder',
      action: '去记经历',
      go: goArchive,
    },
    {
      title: '2. 挑经历生成简历',
      desc: '新建一份简历，挑几段经历排好顺序，再按岗位逐条改写讲法。',
      icon: 'file',
      action: '去建简历',
      go: goResume,
    },
    {
      title: '3. 跟踪投递进度',
      desc: '把心仪岗位记进「投递记录」，推进阶段时自动冻结当时的简历快照。',
      icon: 'send',
      action: '去看看',
      go: goTracker,
    },
  ];
  const s = steps[step];
  return (
    <Modal
      title="欢迎使用简历助手"
      onClose={onClose}
      footer={
        <>
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              上一步
            </button>
          )}
          {step < steps.length - 1 ? (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              下一步
            </button>
          ) : (
            <button className="btn primary" onClick={onClose}>
              开始使用
            </button>
          )}
        </>
      }
    >
      <div className="onboard">
        <div className="onboard-step">
          <Icon name={s.icon} size={22} />
        </div>
        <h3>{s.title}</h3>
        <p className="muted">{s.desc}</p>
        <button
          className="btn"
          onClick={() => {
            s.go();
            onClose();
          }}
        >
          {s.action}
        </button>
      </div>
    </Modal>
  );
}
