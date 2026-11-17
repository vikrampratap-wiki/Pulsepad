import React from 'react';
import { EngineeringLatencyLab } from '../components/EngineeringLatencyLab';
import { StickCalibrationConfig, VirtualGamepadState } from '../protocol/gamepadProtocol';

interface ProtocolLabPageProps {
  gamepadState: VirtualGamepadState;
  lastHexPacket: string[];
  calibration: StickCalibrationConfig;
  onCalibrationChange: React.Dispatch<React.SetStateAction<StickCalibrationConfig>>;
  onButtonToggle: (buttonIndex: number, nextVal: number) => void;
}

/**
 * Sub-Page 4: Dedicated 10-15ms Engineering & Binary Protocol Lab Page
 */
export const ProtocolLabPage: React.FC<ProtocolLabPageProps> = (props) => {
  return (
    <section aria-label="Low Latency Engineering Protocol Lab">
      <EngineeringLatencyLab {...props} />
    </section>
  );
};
