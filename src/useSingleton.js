import {useMutableBox, useIsomorphicLayoutEffect} from './util-hooks';
import {deepPreserveProps} from './utils';
import {useMemo, useState} from 'react';

function updateClassName(box, action, classNames) {
  classNames.split(/\s+/).forEach(name => {
    if (name) {
      box.classList[action](name);
    }
  });
}

const classNamePlugin = {
  name: 'className',
  defaultValue: '',
  fn(instance) {
    const box = instance.popper.firstElementChild;
    const isDefaultRenderFn = () => !!instance.props.render?.$$tippy;

    function add() {
      if (instance.props.className && !isDefaultRenderFn()) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            [
              '@tippyjs/react: Cannot use `className` prop in conjunction with',
              '`render` prop. Place the className on the element you are',
              'rendering.',
            ].join(' '),
          );
        }

        return;
      }

      updateClassName(box, 'add', instance.props.className);
    }

    function remove() {
      if (isDefaultRenderFn()) {
        updateClassName(box, 'remove', instance.props.className);
      }
    }

    return {
      onCreate: add,
      onBeforeUpdate: remove,
      onAfterUpdate: add,
    };
  },
};

export default function useSingletonGenerator(createSingleton) {
  return function useSingleton({disabled = false, overrides = []} = {}) {
    const [mounted, setMounted] = useState(false);
    const mutableBox = useMutableBox({
      children: [],
      renders: 1,
    });

    useIsomorphicLayoutEffect(() => {
      if (!mounted) {
        setMounted(true);
        return;
      }

      const {children, sourceData} = mutableBox;

      if (!sourceData) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(
            [
              '@tippyjs/react: The `source` variable from `useSingleton()` has',
              'not been passed to a <Tippy /> component.',
            ].join(' '),
          );
        }

        return;
      }

      const instance = createSingleton(
        children.map(child => child.instance),
        {
          ...sourceData.props,
          popperOptions: sourceData.instance.props.popperOptions,
          overrides,
          plugins: [classNamePlugin, ...(sourceData.props.plugins || [])],
        },
      );

      mutableBox.instance = instance;

      if (disabled) {
        instance.disable();
      }

      return () => {
        instance.destroy();
        mutableBox.children = children.filter(
          ({instance}) => !instance.state.isDestroyed,
        );
      };
    }, [mounted]);

    useIsomorphicLayoutEffect(() => {
      if (!mounted) {
        return;
      }

      if (mutableBox.renders === 1) {
        mutableBox.renders++;
        return;
      }

      const {children, instance, sourceData} = mutableBox;

      if (!(instance && sourceData)) {
        return;
      }

      const {content, ...props} = sourceData.props;

      instance.setProps(
        deepPreserveProps(instance.props, {
          ...props,
          overrides,
        }),
      );

      instance.setInstances(children.map(child => child.instance));

      if (disabled) {
        instance.disable();
      } else {
        instance.enable();
      }
    });

    return useMemo(() => {
      const source = {
        data: mutableBox,
        hook(data) {
          mutableBox.sourceData = data;
          mutableBox.setSingletonContent = data.setSingletonContent;
        },
        cleanup() {
          mutableBox.sourceData = null;
        },
      };

      const target = {
        hook(data) {
          mutableBox.children = mutableBox.children.filter(
            ({instance}) => data.instance !== instance,
          );
          mutableBox.children.push(data);

          if (
            mutableBox.instance?.state.isMounted &&
            mutableBox.instance?.state.$$activeSingletonInstance ===
              data.instance
          ) {
            mutableBox.setSingletonContent?.(data.content);
          }

          if (mutableBox.instance && !mutableBox.instance.state.isDestroyed) {
            mutableBox.instance.setInstances(
              mutableBox.children.map(child => child.instance),
            );
          }
        },
        cleanup(instance) {
          mutableBox.children = mutableBox.children.filter(
            data => data.instance !== instance,
          );

          if (mutableBox.instance && !mutableBox.instance.state.isDestroyed) {
            mutableBox.instance.setInstances(
              mutableBox.children.map(child => child.instance),
            );
          }
        },
      };

      return [source, target];
    }, []);
  };
}
