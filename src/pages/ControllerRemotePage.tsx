import React from 'react';
import { TouchControllerPad, TouchControllerPadProps } from '../components/TouchControllerPad';

/**
 * Sub-Page 1: Dedicated Controller Remote Page
 * Renders the virtual gaming controller as the primary centerpiece.
 * In 1-Screen Lock Mode (isPureControllerOnly), it locks to 100% of the viewport height with zero scrolling.
 */
export const ControllerRemotePage: React.FC<TouchControllerPadProps> = (props) => {
  return (
    <section
      aria-label="Virtual Gaming Controller Remote"
      className={
        props.isPureControllerOnly
          ? 'flex-1 h-full min-h-0 flex flex-col overflow-hidden'
          : 'flex flex-col'
      }
    >
      <TouchControllerPad {...props} />
    </section>
  );
};
