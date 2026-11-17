import React from 'react';
import { TouchControllerPad, TouchControllerPadProps } from '../components/TouchControllerPad';

/**
 * Sub-Page 1: Dedicated Controller Remote Page
 * Renders the virtual gaming controller as the primary centerpiece.
 */
export const ControllerRemotePage: React.FC<TouchControllerPadProps> = (props) => {
  return (
    <section aria-label="Virtual Gaming Controller Remote">
      <TouchControllerPad {...props} />
    </section>
  );
};
