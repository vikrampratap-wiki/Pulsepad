import React from 'react';
import { CloudGamingSandbox } from '../components/CloudGamingSandbox';
import { TouchControllerPad, TouchControllerPadProps } from '../components/TouchControllerPad';

interface CloudArenaPageProps extends TouchControllerPadProps {
  autostart?: boolean;
  onRumble: (intensity: number, durationMs: number) => void;
}

/**
 * Sub-Page 3: Dedicated Cloud Gaming Test Arena (Mecha Pulse 60fps Game + Live Controller)
 */
export const CloudArenaPage: React.FC<CloudArenaPageProps> = ({
  autostart = false,
  onRumble,
  ...controllerProps
}) => {
  return (
    <section aria-label="Cloud Gaming Test Arena" className="flex flex-col gap-6">
      <CloudGamingSandbox
        gamepadState={controllerProps.gamepadState}
        onRumble={onRumble}
        autostart={autostart}
      />

      <TouchControllerPad {...controllerProps} />
    </section>
  );
};
