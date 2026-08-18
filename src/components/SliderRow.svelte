<script lang="ts">
  interface Props {
    label:  string;
    value:  number;
    min:    number;
    max:    number;
    step:   number;
    unit?:  string;
    onchange?: (v: number) => void;
  }
  let { label, value = $bindable(), min, max, step, unit = '', onchange }: Props = $props();

  function handle(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value);
    value = v;
    onchange?.(v);
  }
</script>

<div class="form-row">
  <label>{label}</label>
  <div class="slider-row">
    <input type="range" {min} {max} {step} {value} oninput={handle} />
    <span class="val">{value}{unit}</span>
  </div>
</div>
