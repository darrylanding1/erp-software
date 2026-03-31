import usePermission from '../../hooks/usePermission';

export default function PermissionGate({
  permission = null,
  allPermissions = [],
  anyPermissions = [],
  fallback = null,
  children,
}) {
  const { can, canAll, canAny } = usePermission();

  let allowed = true;

  if (permission) {
    allowed = can(permission);
  }

  if (allowed && allPermissions.length > 0) {
    allowed = canAll(allPermissions);
  }

  if (allowed && anyPermissions.length > 0) {
    allowed = canAny(anyPermissions);
  }

  if (!allowed) {
    return fallback;
  }

  return children;
}