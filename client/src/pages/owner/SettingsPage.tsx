import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type SubmitEvent } from "react";
import { Notice } from "../../components/Notice";
import { api, describeError } from "../../lib/api";
import { BANKS } from "../../lib/banks";
import { buildSettingsPatch, toForm, type FormState } from "../../lib/settingsForm";
import type { AppSettings } from "../../lib/types";

function SettingsForm({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(settings));
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.updateSettings(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(["settings"], updated);
      setForm(toForm(updated));
      setSaved(true);
    },
  });

  const set = (key: string) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const patch = buildSettingsPatch(settings, form);
  const dirty = Object.keys(patch).length > 0;
  const knownBank = BANKS.some((b) => b.bin === form.bank_bin);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    if (dirty) save.mutate(patch);
  }

  const field = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[key]} onChange={set(key)} {...props} />
    </label>
  );

  return (
    <form onSubmit={handleSubmit} className="stack">
      {save.isError && <Notice kind="error">{describeError(save.error)}</Notice>}
      {saved && <Notice kind="success">Đã lưu cấu hình.</Notice>}

      <section className="card step">
        <h2>Giờ hoạt động</h2>
        <div className="form-row">
          {field("opening_hour", "Giờ mở cửa", { type: "time" })}
          {field("closing_hour", "Giờ đóng cửa", { type: "time" })}
          {field("time_step_minutes", "Bước thời gian (phút)", { type: "number", min: 5, max: 60 })}
        </div>
        {field("allowed_durations", "Thời lượng cho phép (phút, cách nhau bằng dấu phẩy)", { placeholder: "60,90" })}
      </section>

      <section className="card step">
        <h2>Giá</h2>
        <div className="form-row">
          {field("price_5", "Giá sân 5 (đ/giờ)", { type: "number", min: 1000, step: 1000 })}
          {field("price_7", "Giá sân 7 (đ/giờ)", { type: "number", min: 1000, step: 1000 })}
        </div>
      </section>

      <section className="card step">
        <h2>Giữ chỗ, cọc và hủy</h2>
        <div className="form-row">
          {field("hold_timeout_minutes", "Giữ chỗ (phút)", { type: "number", min: 5, max: 60 })}
          {field("deposit_percent", "Tiền cọc (% tổng tiền)", { type: "number", min: 1, max: 100 })}
          {field("cancel_before_hours", "Hủy trước giờ đá (giờ) để được hoàn cọc", { type: "number", min: 0, max: 168 })}
        </div>
      </section>

      <section className="card step">
        <h2>Tài khoản nhận cọc</h2>
        <p className="muted">Dùng để tạo mã QR cho khách. Chưa điền thì khách sẽ không thấy mã QR.</p>
        <label className="field">
          <span>Ngân hàng</span>
          <select
            value={knownBank ? form.bank_bin : form.bank_bin ? "other" : ""}
            onChange={(e) => {
              setSaved(false);
              setForm((f) => ({ ...f, bank_bin: e.target.value === "other" ? f.bank_bin : e.target.value }));
            }}
          >
            <option value="">Chưa chọn</option>
            {BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.name}
              </option>
            ))}
            <option value="other">Ngân hàng khác (nhập mã BIN)</option>
          </select>
        </label>
        <div className="form-row">
          {field("bank_bin", "Mã BIN (6 số)", { inputMode: "numeric", maxLength: 6 })}
          {field("bank_account_no", "Số tài khoản", { inputMode: "numeric" })}
        </div>
        {field("bank_account_name", "Tên chủ tài khoản")}
      </section>

      <button className="btn btn-primary" disabled={!dirty || save.isPending}>
        {save.isPending ? "Đang lưu..." : "Lưu cấu hình"}
      </button>
    </form>
  );
}

export function SettingsPage() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  return (
    <div className="page narrow">
      <h1>Cấu hình</h1>
      {settings.isError && <Notice kind="error">{describeError(settings.error)}</Notice>}
      {settings.isLoading && <p className="muted">Đang tải...</p>}
      {settings.data && <SettingsForm settings={settings.data} />}
    </div>
  );
}
