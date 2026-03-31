import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const toId = (value) => (value ? Number(value) : null);

export default function OrganizationScopeSwitcher() {
  const { organizationMeta, activeScope, setActiveScope } = useAuth();

  const [companyId, setCompanyId] = useState(activeScope?.company_id || '');
  const [branchId, setBranchId] = useState(activeScope?.branch_id || '');
  const [businessUnitId, setBusinessUnitId] = useState(activeScope?.business_unit_id || '');

  useEffect(() => {
    setCompanyId(activeScope?.company_id || '');
    setBranchId(activeScope?.branch_id || '');
    setBusinessUnitId(activeScope?.business_unit_id || '');
  }, [activeScope]);

  const companies = organizationMeta?.tree || [];

  const selectedCompany = useMemo(
    () => companies.find((item) => Number(item.id) === Number(companyId)) || null,
    [companies, companyId]
  );

  const availableBranches = selectedCompany?.branches || [];

  const selectedBranch = useMemo(
    () => availableBranches.find((item) => Number(item.id) === Number(branchId)) || null,
    [availableBranches, branchId]
  );

  const availableBusinessUnits = useMemo(() => {
    if (selectedBranch) return selectedBranch.business_units || [];
    return selectedCompany?.company_level_business_units || [];
  }, [selectedCompany, selectedBranch]);

  const handleCompanyChange = (value) => {
    setCompanyId(value);
    setBranchId('');
    setBusinessUnitId('');
  };

  const handleBranchChange = (value) => {
    setBranchId(value);
    setBusinessUnitId('');
  };

  const handleApply = () => {
    setActiveScope({
      company_id: toId(companyId),
      branch_id: toId(branchId),
      business_unit_id: toId(businessUnitId),
    });

    window.location.reload();
  };

  if (!companies.length) return null;

  return (
    <div className="rounded-lg bg-[#faf7ff] p-2">
      {/* TITLE */}
      <p className="text-[9px] uppercase tracking-wide text-[#9c92b7]">
        Scope
      </p>

      {/* FIELDS */}
      <div className="mt-1.5 flex flex-col gap-1.5">
        <select
          value={companyId}
          onChange={(e) => handleCompanyChange(e.target.value)}
          className="h-8 rounded-lg border border-[#ece5f8] bg-white px-2 text-[11px] text-[#3f345e] outline-none focus:border-[#9b6bff]"
        >
          <option value="">Company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>

        <select
          value={branchId}
          onChange={(e) => handleBranchChange(e.target.value)}
          disabled={!companyId}
          className="h-8 rounded-lg border border-[#ece5f8] bg-white px-2 text-[11px] text-[#3f345e] outline-none focus:border-[#9b6bff] disabled:bg-[#f8f6fc] disabled:text-[#9e95b7]"
        >
          <option value="">Branch</option>
          {availableBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>

        <select
          value={businessUnitId}
          onChange={(e) => setBusinessUnitId(e.target.value)}
          disabled={!companyId}
          className="h-8 rounded-lg border border-[#ece5f8] bg-white px-2 text-[11px] text-[#3f345e] outline-none focus:border-[#9b6bff] disabled:bg-[#f8f6fc] disabled:text-[#9e95b7]"
        >
          <option value="">Unit</option>
          {availableBusinessUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleApply}
          disabled={!companyId}
          className="h-8 rounded-lg bg-[#6d3fd1] text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}