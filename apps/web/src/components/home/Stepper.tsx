import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  Children,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Stepper.css';

// ── Interfaces ────────────────────────────────────────────────

interface RenderStepIndicatorProps {
  step: number;
  currentStep: number;
  onStepClick: (step: number) => void;
}

interface StepperProps {
  children: ReactNode;
  initialStep?: number;
  /** Controlled step (1-based). When set, parent owns step via `onStepChange`. */
  currentStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: RenderStepIndicatorProps) => ReactNode;
  hideButtons?: boolean;
}

export interface StepProps {
  children: ReactNode;
}

interface StepContentWrapperProps {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: ReactNode;
  className: string;
}

interface SlideTransitionProps {
  children: ReactNode;
  direction: number;
  onHeightReady: (h: number) => void;
}

interface StepIndicatorProps {
  step: number;
  currentStep: number;
  onClickStep: (step: number) => void;
  disableStepIndicators: boolean;
}

interface StepConnectorProps {
  isComplete: boolean;
}

// ── Step (exported for use in JSX) ───────────────────────────

export function Step({ children }: StepProps) {
  return <>{children}</>;
}

// ── StepContentWrapper ────────────────────────────────────────

function StepContentWrapper({
  isCompleted,
  currentStep,
  direction,
  children,
  className,
}: StepContentWrapperProps) {
  const [height, setHeight] = useState<number | 'auto'>('auto');

  return (
    <motion.div
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <AnimatePresence initial={false} custom={direction} mode="sync">
        {isCompleted ? (
          <motion.div key="completed" style={{ position: 'absolute', inset: 0 }} />
        ) : (
          <SlideTransition
            key={currentStep}
            direction={direction}
            onHeightReady={(h) => setHeight(h)}
          >
            <div className={className}>{children}</div>
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── SlideTransition ───────────────────────────────────────────

function SlideTransition({ children, direction, onHeightReady }: SlideTransitionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (containerRef.current) {
      onHeightReady(containerRef.current.offsetHeight);
    }
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={{
        enter: (d: number) => ({ x: d >= 0 ? '100%' : '-100%', opacity: 0 }),
        center: { x: '0%', opacity: 1 },
        exit: (d: number) => ({ x: d >= 0 ? '-100%' : '100%', opacity: 0 }),
      }}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.35, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

// ── StepIndicator ─────────────────────────────────────────────

function StepIndicator({
  step,
  currentStep,
  onClickStep,
  disableStepIndicators,
}: StepIndicatorProps) {
  const isActive = step === currentStep;
  const isComplete = step < currentStep;

  let bgColor = '#f1e6d6';
  if (isActive) bgColor = '#FCBC5A';
  if (isComplete) bgColor = '#00577C';

  return (
    <div
      className="step-indicator"
      onClick={() => !disableStepIndicators && onClickStep(step)}
      style={{ cursor: disableStepIndicators ? 'default' : 'pointer' }}
    >
      <div
        className="step-indicator-inner"
        style={{ backgroundColor: bgColor }}
      >
        {isComplete ? (
          <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="#FCBC5A" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : isActive ? (
          <span className="step-number">{step}</span>
        ) : (
          <span className="step-number">{step}</span>
        )}
      </div>
    </div>
  );
}

// ── StepConnector ─────────────────────────────────────────────

function StepConnector({ isComplete }: StepConnectorProps) {
  return (
    <div className="step-connector">
      <motion.div
        className="step-connector-inner"
        initial={{ width: '0%' }}
        animate={{ width: isComplete ? '100%' : '0%' }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────

export default function Stepper({
  children,
  initialStep = 1,
  currentStep: currentStepProp,
  onStepChange,
  onFinalStepCompleted,
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Next',
  disableStepIndicators = false,
  renderStepIndicator,
  hideButtons = false,
}: StepperProps) {
  const [internalStep, setInternalStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);
  const [isCompleted, setIsCompleted] = useState(false);
  const prevResolvedStepRef = useRef<number | null>(null);

  const stepArray = Children.toArray(children);
  const totalSteps = stepArray.length;

  const isControlled = currentStepProp !== undefined;
  const currentStep = isControlled ? currentStepProp! : internalStep;

  useEffect(() => {
    if (prevResolvedStepRef.current === null) {
      prevResolvedStepRef.current = currentStep;
      return;
    }
    if (currentStep !== prevResolvedStepRef.current) {
      setDirection(currentStep > prevResolvedStepRef.current ? 1 : -1);
      prevResolvedStepRef.current = currentStep;
    }
  }, [currentStep]);

  const goToStep = (step: number) => {
    if (step < 1 || step > totalSteps) return;
    if (!isControlled) {
      setInternalStep(step);
    }
    onStepChange?.(step);
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      goToStep(currentStep + 1);
    } else {
      setIsCompleted(true);
      onFinalStepCompleted?.();
    }
  };

  const handleBack = () => {
    if (isCompleted) {
      setIsCompleted(false);
      setDirection(-1);
    } else {
      goToStep(currentStep - 1);
    }
  };

  const activeContent = stepArray[currentStep - 1];

  return (
    <div className={`outer-container ${stepContainerClassName}`}>
      <div className={`step-circle-container ${stepCircleContainerClassName}`}>
        {/* Step indicators */}
        <div className="step-indicator-row">
          {stepArray.map((_, index) => {
            const step = index + 1;
            return (
              <React.Fragment key={step}>
                {renderStepIndicator ? (
                  renderStepIndicator({ step, currentStep, onStepClick: goToStep })
                ) : (
                  <StepIndicator
                    step={step}
                    currentStep={currentStep}
                    onClickStep={goToStep}
                    disableStepIndicators={disableStepIndicators}
                  />
                )}
                {step < totalSteps && (
                  <StepConnector isComplete={step < currentStep} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={`step-content-default ${contentClassName}`}
        >
          <div className={`step-default ${contentClassName}`}>{activeContent}</div>
        </StepContentWrapper>

        {/* Footer nav */}
        {!hideButtons && (
          <div className={`footer-container ${footerClassName}`}>
            <div className={`footer-nav ${currentStep > 1 || isCompleted ? 'spread' : 'end'}`}>
              {(currentStep > 1 || isCompleted) && (
                <button type="button" className="back-button" onClick={handleBack} {...backButtonProps}>
                  {backButtonText}
                </button>
              )}
              {!isCompleted && (
                <button type="button" className="next-button" onClick={handleNext} {...nextButtonProps}>
                  {currentStep === totalSteps ? 'Finish' : nextButtonText}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
