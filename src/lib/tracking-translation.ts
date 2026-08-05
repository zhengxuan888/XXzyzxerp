type TranslationRule = readonly [RegExp, string];

const translationRules: TranslationRule[] = [
  [/^almacenado temporalmente\.?$/i, "临时存储"],
  [/^incidencia en el reparto\.?$/i, "派送中出现问题"],
  [/^en reparto\.?$/i, "派送中"],
  [/^nuevo reparto\.?$/i, "已安排新一轮派送"],
  [/^cambio nueva fecha de entrega\.?$/i, "更改新的交货日期"],
  [/^enviado\.?$/i, "已发出"],
  [/^(?:en espera de recepci[oó]n por|pendiente de recepci[oó]n por)\s+ctt express\.?$/i, "等待 CTT Express 接收"],
  [/^intento de entrega/i, "物流商已尝试派送，但本次未成功"],
  [/^entregado\.?$/i, "物流商显示已送达，仍需人工确认客户实际签收"],
  [/^en tr[aá]nsito/i, "快件正在运输途中"],
  [/^devuelto|^devoluci[oó]n/i, "快件正在退回或已退回寄件方"],
  [/^em entrega\s*-\s*o envio saiu para entrega\.\s*ser[aá] entregue durante o dia\.?$/i, "快件正在派送，预计当天送达"],
  [/^n[aã]o entregue\s*-\s*a entrega do envio n[aã]o foi conseguida\.?\s*-\s*motivo:\s*o destinat[aá]rio n[aã]o atendeu\.?$/i, "快件未送达：收件人未应答"],
  [/^em tr[aâ]nsito\s*-\s*chegou ao centro operacional\.?$/i, "快件运输中，已到达运营中心"],
  [/^aceite\s*-\s*o envio foi aceite\.\s*o processo de envio foi iniciado\.?$/i, "快件已受理，运输流程已开始"],
  [/^em distribui[cç][aã]o|^em entrega/i, "快件正在派送"],
  [/^tentativa de entrega/i, "物流商已尝试派送，但本次未成功"],
  [/^entregue\.?$/i, "物流商显示已送达，仍需人工确认客户实际签收"],
  [/^em tr[aâ]nsito/i, "快件正在运输途中"],
  [/^devolvido|^devolu[cç][aã]o/i, "快件正在退回或已退回寄件方"],
  [/^u dostavi\.?$/i, "快件正在派送"],
  [/^u tranzitu\.?$/i, "快件正在运输途中"],
  [/^isporu[cč]eno\.?$/i, "物流商显示已送达，仍需人工确认客户实际签收"],
  [/^vra[cć]eno\.?$/i, "快件已退回寄件方"],
  [/^out for delivery/i, "快件正在派送"],
  [/^delivered|^successfully delivered/i, "物流商显示已送达，仍需人工确认客户实际签收"],
  [/^available for pick.?up|^ready for pick.?up/i, "快件已到达取件点，等待客户领取"],
  [/^delivery attempt|^attempted delivery/i, "物流商已尝试派送，但本次未成功"],
  [/^address.*(?:incorrect|invalid|incomplete)|^incorrect address/i, "收件地址有误或信息不完整"],
  [/^customs.*clear|^cleared customs/i, "快件已完成清关"],
  [/^customs/i, "快件正在办理清关"],
  [/^arrived.*destination|^destination country/i, "快件已到达目的地国家或地区"],
  [/^departed.*facilit|^departed.*sort/i, "快件已离开分拨中心，继续运输"],
  [/^arrived.*facilit|^arrived.*sort/i, "快件已到达分拨中心"],
  [/^in transit|^shipment in transit/i, "快件正在运输途中"],
  [/^picked up|^collected by carrier|^accepted by carrier/i, "物流商已揽收快件"],
  [/^shipment.*information.*received|^label created|^electronic information/i, "物流商已收到运单信息，等待揽收"],
  [/^refused/i, "客户拒收快件"],
  [/^return.*sender|^returned/i, "快件正在退回或已退回寄件方"],
];

export function translateTrackingDescription(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  return translationRules.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
