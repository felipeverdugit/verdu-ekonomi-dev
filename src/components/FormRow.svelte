<script lang="ts">
  interface Props {
    label:    string;
    value:    number;
    step?:    number;
    min?:     number;
    width?:   string;
    onchange?: (v: number) => void;
  }
  let { label, value = $bindable(), step = 1, min = 0, width = '140px', onchange }: Props = $props();

  function handle(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value) || 0;
    value = v;
    onchange?.(v);
  }
</script>

<div class="form-row">
  <label>{label}</label>
  <input type="number" {step} {min} {value} oninput={handle} style:width />
</div>
