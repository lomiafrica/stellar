import java.io.ByteArrayInputStream;
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtMethod;
import javassist.expr.ExprEditor;
import javassist.expr.MethodCall;

/**
 * Anchor Platform pins Hikari minimum-idle at 5. Those sockets stay open and
 * Railway will not sleep the service. Rewrite that one setting to 0 so idle
 * connections close.
 */
public class IdlePoolAgent {
  public static void premain(String args, Instrumentation inst) {
    inst.addTransformer(new PoolFloorTransformer());
  }

  static final class PoolFloorTransformer implements ClassFileTransformer {
    @Override
    public byte[] transform(
        ClassLoader loader,
        String className,
        Class<?> classBeingRedefined,
        ProtectionDomain protectionDomain,
        byte[] classfileBuffer) {
      if (!"org/stellar/anchor/platform/configurator/DataConfigAdapter".equals(className)) {
        return null;
      }
      try {
        ClassPool pool = ClassPool.getDefault();
        CtClass cls = pool.makeClass(new ByteArrayInputStream(classfileBuffer));
        CtMethod method = cls.getDeclaredMethod("setSpringDataDefaults");
        method.instrument(
            new ExprEditor() {
              @Override
              public void edit(MethodCall call) throws javassist.CannotCompileException {
                if (!"set".equals(call.getMethodName())) return;
                call.replace(
                    "if ($1 != null && \"spring.datasource.hikari.minimum-idle\".equals($1)) {"
                        + " $proceed($1, 0);"
                        + "} else {"
                        + " $proceed($$);"
                        + "}");
              }
            });
        byte[] rewritten = cls.toBytecode();
        cls.detach();
        System.err.println("idle-pool-agent: minimum-idle forced to 0");
        return rewritten;
      } catch (Exception err) {
        err.printStackTrace();
        return null;
      }
    }
  }
}
